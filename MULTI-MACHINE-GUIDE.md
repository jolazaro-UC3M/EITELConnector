# EITEL Multi-Machine Deployment and Test Guide

This guide walks through deploying the EITEL PoC across **three physical machines on a LAN** and manually verifying a complete handshake + EDC data transfer. It replaces the old star-coordinator simulator guide and reflects the current `fix/endpoint` branch with the real `EITELCoordinator` service.

---

## Architecture overview

```
┌────────────────────────┐        ┌──────────────────────────┐        ┌──────────────────────────┐
│   COORDINATOR machine  │        │    PRODUCER machine      │        │    CONSUMER machine      │
│                        │        │                          │        │                          │
│  EITELCoordinator      │        │  eitel-node producer     │        │  eitel-node consumer     │
│  (FastAPI, port 8000)  │        │  handshake: 8090         │        │  handshake: 8091         │
│                        │        │  EDC control: 11000      │        │  EDC control: 11010      │
│  Issues Ed25519-signed │        │           mgmt: 11002    │        │           mgmt: 11012    │
│  Verifiable Credentials│        │           proto: 11003   │        │           proto: 11013   │
│                        │        │  copyparty: 3923 (local) │        │  download-sink: 8082 (lo)│
└────────────────────────┘        └──────────────────────────┘        └──────────────────────────┘
         ↑                                   ↑↓                                  ↑↓
  Keys + VCs issued                  EITEL handshake                     EITEL handshake
  (offline after issuance)           + EDC DSP negotiation               + EDC transfer
```

**What the Coordinator does:**

1. Generates an Ed25519 keypair at setup time.
2. Issues signed Verifiable Credentials (VCs) for nodes that provide their `did:key`.
3. Serves its public key at `GET /public-key` (JWKS format) so nodes can verify credentials.
4. After key issuance, nodes can operate fully offline from the Coordinator.

**Data flow:**

1. Consumer fetches Producer's VC (or has it on disk).
2. Consumer sends its own VC to `POST /handshake/initiate` on Producer.
3. Producer verifies the VC against the Coordinator's public key → returns a session token + DSP endpoint.
4. Consumer uses DSP endpoint to run EDC contract negotiation and transfer.

---

## Prerequisites

### All machines

- Git
- Docker Engine + Compose plugin (`docker compose` v2)
- Ports opened on LAN firewall (see [Port reference](#port-reference))

### Coordinator machine only

- Python 3.13+
- [uv](https://docs.astral.sh/uv/) package manager (`pip install uv` or see uv docs)

---

## Step-by-step deployment

### Phase 0 — Plan your IPs

Pick static LAN IPs or DHCP reservations before you start. You will use these throughout.

```
COORDINATOR_IP=192.168.1.10    # example — replace with yours
PRODUCER_IP=192.168.1.11
CONSUMER_IP=192.168.1.12
```

Write them down. Every placeholder below uses these names.

---

### Phase 1 — Coordinator machine

#### 1.1 Clone EITELCoordinator

```bash
git clone https://github.com/jolazaro-UC3M/EITELCoordinator.git
cd EITELCoordinator
```

#### 1.2 Install dependencies

```bash
uv sync
```

#### 1.3 Generate Ed25519 keypair

```bash
uv run python scripts/generate_keys.py
```

This creates two files in the `keys/` directory:

- `keys/coordinator-ed25519-priv.jwk` — private key (keep on coordinator only)
- `keys/coordinator-ed25519-pub.jwk` — public key (copy to both nodes in Phase 4)

#### 1.4 Generate TLS certificates (optional for PoC)

For a PoC with `COORDINATOR_TLS_VERIFY_CLIENT=false` you can skip TLS and run plain HTTP. If you want TLS:

```bash
uv run python scripts/generate_certs.py
```

Certificates land in `certs/`. Skip this step and use plain HTTP for initial testing.

#### 1.5 Start the coordinator

**Plain HTTP (PoC mode):**

```bash
uv run uvicorn src.coordinator.main:app --host 0.0.0.0 --port 8000
```

**With TLS (production-like):**

```bash
uv run uvicorn src.coordinator.main:app \
  --host 0.0.0.0 --port 8000 \
  --ssl-keyfile certs/coordinator-key.pem \
  --ssl-certfile certs/coordinator-cert.pem
```

Set environment variables before starting if needed:

```bash
export COORDINATOR_PRIVATE_KEY_PATH=keys/coordinator-ed25519-priv.jwk
export COORDINATOR_PUBLIC_KEY_PATH=keys/coordinator-ed25519-pub.jwk
export COORDINATOR_TLS_VERIFY_CLIENT=false
```

Leave the coordinator running in a screen/tmux session.

#### 1.6 Verify coordinator health

```bash
# Plain HTTP
curl http://COORDINATOR_IP:8000/health

# TLS with self-signed cert
curl -k https://COORDINATOR_IP:8000/health
```

Expected response: `{"status":"healthy","version":"..."}` or similar.

Also check that the public key is served:

```bash
curl http://COORDINATOR_IP:8000/public-key
```

Expected: `{"keys":[{"kty":"OKP","crv":"Ed25519","x":"...","kid":"eitel-coordinator-poc-1","use":"sig"}]}`

---

### Phase 2 — Producer node (first boot — get DID)

The node generates its `did:key` identity on first start. You need the DID before the coordinator can issue a VC.

#### 2.1 Clone EITELConnector and checkout the branch

```bash
git clone https://github.com/<your-fork>/EITELConnector.git
cd EITELConnector
git checkout fix/endpoint
cd eitel-node
```

#### 2.2 Create required directories

```bash
mkdir -p keys identity/producer
```

#### 2.3 Create shared Docker network

```bash
docker network create eitel-shared --driver bridge
```

Only needed once. Harmless if it already exists.

#### 2.4 Create `.env` file

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
EITEL_NODE_EDC_API_KEY=poc-api-key
POSTGRES_PASSWORD=changeme
COPYPARTY_PASSWORD=changeme
EITEL_NODE_SESSION_TOKEN_SECRET=change-me-generate-strong-random-value-here
```

**Critical for distributed mode** — these two must use the LAN IP, not internal Docker names:

```bash
# In docker-compose.producer.yml, override these:
EITEL_NODE_EDC_DSP_ENDPOINT=http://PRODUCER_IP:11003/api/protocol/2025-1
EDC_DSP_CALLBACK_ADDRESS=http://PRODUCER_IP:11003/api/protocol
```

Edit `docker-compose.producer.yml` and replace the internal hostname values:

```yaml
  edc-control:
    environment:
      - EDC_DSP_CALLBACK_ADDRESS=http://PRODUCER_IP:11003/api/protocol   # was edc-producer-control

  handshake:
    environment:
      - EITEL_NODE_EDC_DSP_ENDPOINT=http://PRODUCER_IP:11003/api/protocol/2025-1  # was edc-producer-control
```

#### 2.5 Comment out the eitel-coordinator service

The `eitel-coordinator` service in `docker-compose.producer.yml` is for **single-machine testing only**. In distributed mode, comment it out:

```yaml
# eitel-coordinator:        # comment out for distributed mode
#   image: eitel/coordinator:latest
#   ...
```

#### 2.6 Start the producer stack (first boot)

```bash
docker compose -f docker-compose.producer.yml up -d --build
```

Wait ~30 seconds for services to start.

#### 2.7 Get the producer DID

```bash
curl http://PRODUCER_IP:8090/health
```

Expected response:

```json
{"status":"ok","node_did":"did:key:z6Mk...","edc_management_url":"..."}
```

**Save the `node_did` value** — you need it in Phase 4.

---

### Phase 3 — Consumer node (first boot — get DID)

Repeat Phase 2 steps on the Consumer machine with `docker-compose.consumer.yml`.

#### 3.1–3.3 Same as Producer (clone, mkdir, network)

```bash
git clone https://github.com/<your-fork>/EITELConnector.git
cd EITELConnector && git checkout fix/endpoint && cd eitel-node
mkdir -p keys identity/consumer
docker network create eitel-shared --driver bridge
```

#### 3.4 Create `.env` file and set LAN IPs

```bash
cp .env.example .env
```

Edit `docker-compose.consumer.yml` and replace internal hostnames:

```yaml
  edc-control:
    environment:
      - EDC_DSP_CALLBACK_ADDRESS=http://CONSUMER_IP:11013/api/protocol   # was edc-consumer-control

  handshake:
    environment:
      - EITEL_NODE_EDC_DSP_ENDPOINT=http://CONSUMER_IP:11013/api/protocol/2025-1  # was edc-consumer-control
```

No `eitel-coordinator` service exists in `docker-compose.consumer.yml` — nothing to comment out.

#### 3.5 Start the consumer stack (first boot)

```bash
docker compose -f docker-compose.consumer.yml up -d --build
```

#### 3.6 Get the consumer DID

```bash
curl http://CONSUMER_IP:8091/health
```

**Save the `node_did` value.**

---

### Phase 4 — Coordinator issues VCs for both nodes

On the **Coordinator machine**, use the credential issuance script to generate VCs for each node.

#### 4.1 Issue VC for Producer

You have the Producer's DID from Phase 2.7. On the Coordinator machine:

```bash
cd EITELCoordinator
uv run python scripts/issue_eitel_credentials.py \
  --name "EITEL Producer" \
  --id "node-producer" \
  --did "did:key:PRODUCER_DID_HERE" \
  --role "producer" \
  --output credential-producer.json

cat credential-producer.json
```

#### 4.2 Issue VC for Consumer

You have the Consumer's DID from Phase 3.7. On the Coordinator machine:

```bash
uv run python scripts/issue_eitel_credentials.py \
  --name "EITEL Consumer" \
  --id "node-consumer" \
  --did "did:key:CONSUMER_DID_HERE" \
  --role "consumer" \
  --output credential-consumer.json

cat credential-consumer.json
```

#### 4.3 Export the coordinator public key

```bash
curl http://COORDINATOR_IP:8000/public-key | jq '.keys[0]' > coordinator-ed25519-pub.jwk
cat coordinator-ed25519-pub.jwk
```

You now have three files on the Coordinator machine:

| File | Destination |
|---|---|
| `coordinator-ed25519-pub.jwk` | Both nodes → `eitel-node/keys/coordinator_pubkey.jwk` |
| `credential-producer.json` | Producer → `eitel-node/identity/producer/credential.json` |
| `credential-consumer.json` | Consumer → `eitel-node/identity/consumer/credential.json` |

#### 4.4 Copy files to Producer

From the Coordinator machine, copy the credential and public key to Producer:

```bash
scp credential-producer.json user@PRODUCER_IP:/path/to/EITELConnector/eitel-node/identity/producer/credential.json
scp coordinator-ed25519-pub.jwk user@PRODUCER_IP:/path/to/EITELConnector/eitel-node/keys/coordinator_pubkey.jwk
```

Or, on the **Producer machine**, fetch the public key directly from the Coordinator:

```bash
curl http://COORDINATOR_IP:8000/public-key | jq '.keys[0]' > eitel-node/keys/coordinator_pubkey.jwk
```

#### 4.5 Copy files to Consumer

From the Coordinator machine, copy the credential and public key to Consumer:

```bash
scp credential-consumer.json user@CONSUMER_IP:/path/to/EITELConnector/eitel-node/identity/consumer/credential.json
scp coordinator-ed25519-pub.jwk user@CONSUMER_IP:/path/to/EITELConnector/eitel-node/keys/coordinator_pubkey.jwk
```

Or, on the **Consumer machine**, fetch the public key directly from the Coordinator:

```bash
curl http://COORDINATOR_IP:8000/public-key | jq '.keys[0]' > eitel-node/keys/coordinator_pubkey.jwk
```

**On Windows**, use PowerShell `scp`, WinSCP, or manually fetch the files via curl on each node.

---

### Phase 5 — Producer node (restart with VCs)

#### 5.1 Verify files are in place

```bash
ls eitel-node/keys/coordinator_pubkey.jwk
ls eitel-node/identity/producer/credential.json
```

#### 5.2 Restart the handshake service

```bash
cd eitel-node
docker compose -f docker-compose.producer.yml restart handshake
```

Or do a full restart if you changed env vars:

```bash
docker compose -f docker-compose.producer.yml down
docker compose -f docker-compose.producer.yml up -d
```

#### 5.3 Verify node health includes identity

```bash
curl http://PRODUCER_IP:8090/health
```

The response should now show a `node_did` — same DID as before.

```bash
curl http://PRODUCER_IP:8090/identity
```

Should return the node's DID and confirm VC is loaded.

---

### Phase 6 — Consumer node (restart with VCs)

Same as Phase 5 with `docker-compose.consumer.yml` and consumer paths.

```bash
cd eitel-node
docker compose -f docker-compose.consumer.yml restart handshake
curl http://CONSUMER_IP:8091/health
curl http://CONSUMER_IP:8091/identity
```

---

### Phase 7 — Connectivity checks

Verify all required connections work before running the handshake.

#### From Coordinator machine

```bash
curl http://PRODUCER_IP:8090/health    # → {"status":"ok","node_did":"..."}
curl http://CONSUMER_IP:8091/health    # → {"status":"ok","node_did":"..."}
```

#### From Producer machine

```bash
curl http://COORDINATOR_IP:8000/health          # → coordinator healthy
curl http://CONSUMER_IP:11013/api/protocol/.well-known/dspace-version  # → DSP version
```

#### From Consumer machine

```bash
curl http://COORDINATOR_IP:8000/health          # → coordinator healthy
curl http://PRODUCER_IP:11003/api/protocol/.well-known/dspace-version  # → DSP version
curl http://PRODUCER_IP:8090/health             # → producer node healthy
```

If any connection fails, check [Firewall rules](#firewall-rules) and verify Docker port bindings with `docker ps`.

---

### Phase 8 — Run the handshake

The consumer initiates a handshake with the producer by presenting its VC.

#### Get consumer VC from file

```bash
# On consumer machine
cat eitel-node/identity/consumer/credential.json
```

#### Send handshake from consumer to producer

```bash
# Replace <VC_JSON> with the full credential JSON
curl -X POST http://PRODUCER_IP:8090/handshake/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "did": "did:key:CONSUMER_DID_HERE",
    "eitel_vc": <VC_JSON>,
    "gaia_x_vp": null
  }'
```

Expected response:

```json
{
  "status": "ok",
  "session_token": "eyJ...",
  "dsp_endpoint": "http://PRODUCER_IP:11003/api/protocol/2025-1"
}
```

If `status` is not `ok`, see [Troubleshooting](#troubleshooting).

#### Verify peer registration (optional)

```bash
curl http://PRODUCER_IP:8090/status \
  -H "Authorization: Bearer SESSION_TOKEN_HERE"
```

Should list the consumer DID in `registered_peers`.

---

### Phase 9 — Run the EDC transfer

The transfer flow requires EDC contract negotiation before data moves. The PowerShell script `run-poc-transfer.ps1` automates this end-to-end for single-machine or scenarios where all ports are forwarded locally. For true multi-machine, use the manual steps below.

#### PowerShell (single-machine or with port forwarding)

```powershell
cd eitel-node
.\scripts\run-poc-transfer.ps1 `
  -SkipCoordinatorStart `
  -EDCManagementUrl "http://PRODUCER_IP:11002/api/management" `
  -ConsumerEDCManagementUrl "http://CONSUMER_IP:11012/api/management"
```

#### Manual curl steps (multi-machine)

**Step 9a — Seed test data on Producer copyparty**

```bash
# On Producer machine
docker exec eitel-node-copyparty-producer sh -c \
  "printf '{\"dataset\":\"test\",\"records\":[{\"id\":1}]}\n' > /data/test-dataset.json"
```

**Step 9b — Register asset in Producer EDC**

```bash
# From any machine with access to Producer
PRODUCER_MGMT=http://PRODUCER_IP:11002/api/management
API_KEY=poc-api-key

curl -X POST $PRODUCER_MGMT/v3/assets \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {"edc":"https://w3id.org/edc/v0.0.1/ns/"},
    "@id": "test-dataset.json",
    "@type": "Asset",
    "properties": {"name":"Test Dataset","contenttype":"application/json"},
    "dataAddress": {
      "@type": "DataAddress",
      "type": "HttpData",
      "baseUrl": "http://copyparty:3923/files/test-dataset.json?pw=changeme",
      "method": "GET"
    }
  }'
```

**Step 9c — Register policy and contract definition in Producer EDC**

```bash
# Policy
curl -X POST $PRODUCER_MGMT/v3/policydefinitions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {"@vocab":"https://w3id.org/edc/v0.0.1/ns/","odrl":"http://www.w3.org/ns/odrl/2/"},
    "@id": "policy-test-dataset",
    "@type": "PolicyDefinition",
    "policy": {
      "@context": "http://www.w3.org/ns/odrl.jsonld",
      "@type": "Set",
      "odrl:permission": [{"odrl:action":"http://www.w3.org/ns/odrl/2/use","odrl:target":"test-dataset.json"}]
    }
  }'

# Contract definition
curl -X POST $PRODUCER_MGMT/v3/contractdefinitions \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {"@vocab":"https://w3id.org/edc/v0.0.1/ns/"},
    "@id": "contract-test-dataset",
    "@type": "ContractDefinition",
    "accessPolicyId": "policy-test-dataset",
    "contractPolicyId": "policy-test-dataset",
    "assetsSelector": [{"@type":"Criterion","operandLeft":"https://w3id.org/edc/v0.0.1/ns/id","operator":"=","operandRight":"test-dataset.json"}]
  }'
```

**Step 9d — Request catalog from Consumer EDC**

```bash
CONSUMER_MGMT=http://CONSUMER_IP:11012/api/management
DSP_ENDPOINT=http://PRODUCER_IP:11003/api/protocol/2025-1

curl -X POST $CONSUMER_MGMT/v3/catalog/request \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {"edc":"https://w3id.org/edc/v0.0.1/ns/"},
    "@type": "CatalogRequest",
    "counterPartyId": "producer-connector",
    "counterPartyAddress": "'$DSP_ENDPOINT'",
    "protocol": "dataspace-protocol-http:2025-1"
  }'
```

Locate the `odrl:hasPolicy/@id` value from the dataset matching `test-dataset.json`. This is `OFFER_ID`.

**Step 9e — Start contract negotiation**

```bash
curl -X POST $CONSUMER_MGMT/v3/contractnegotiations \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {"edc":"https://w3id.org/edc/v0.0.1/ns/"},
    "@type": "ContractRequest",
    "protocol": "dataspace-protocol-http:2025-1",
    "counterPartyAddress": "'$DSP_ENDPOINT'",
    "policy": {
      "@context": "http://www.w3.org/ns/odrl.jsonld",
      "@type": "odrl:Offer",
      "@id": "OFFER_ID",
      "assigner": "producer-connector",
      "target": "test-dataset.json",
      "odrl:permission": [{"odrl:action":"http://www.w3.org/ns/odrl/2/use","odrl:target":"test-dataset.json"}]
    }
  }'
```

Note the returned negotiation `@id` → `NEGOTIATION_ID`.

**Step 9f — Wait for agreement and get contract ID**

```bash
# Poll until VERIFIED state
curl $CONSUMER_MGMT/v3/contractnegotiations/NEGOTIATION_ID \
  -H "x-api-key: $API_KEY"

# Get agreements
curl -X POST $CONSUMER_MGMT/v3/contractagreements/request \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"@context":{"@vocab":"https://w3id.org/edc/v0.0.1/ns/"},"@type":"QuerySpec","limit":100}'
```

Note the `@id` of the new agreement → `AGREEMENT_ID`.

**Step 9g — Initiate transfer**

```bash
SINK_URL=http://eitel-node-download-sink-consumer:8082/ingest
TRANSFER_SINK="$SINK_URL?contractId=AGREEMENT_ID&assetId=test-dataset.json"

curl -X POST $CONSUMER_MGMT/v3/transferprocesses \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "@context": {"edc":"https://w3id.org/edc/v0.0.1/ns/"},
    "@type": "TransferRequest",
    "protocol": "dataspace-protocol-http:2025-1",
    "counterPartyAddress": "'$DSP_ENDPOINT'",
    "counterPartyId": "producer-connector",
    "contractId": "AGREEMENT_ID",
    "transferType": "HttpData-PUSH",
    "dataDestination": {
      "type": "HttpData",
      "baseUrl": "'$TRANSFER_SINK'",
      "method": "POST"
    }
  }'
```

Note `TRANSFER_ID` from response.

**Step 9h — Poll transfer state**

```bash
curl $CONSUMER_MGMT/v3/transferprocesses/TRANSFER_ID/state \
  -H "x-api-key: $API_KEY"
```

State codes: `100`=INITIAL, `400`=REQUESTED, `500`=STARTED, `700`=COMPLETED, `800`=TERMINATED.

Poll every 2-3 seconds until `700` (COMPLETED).

---

### Phase 10 — Verify downloaded file

The download-sink service on the Consumer captures incoming data.

```bash
# On Consumer machine (port is localhost-only by default)
curl http://localhost:8082/files
```

You should see `test-dataset.json` listed. Fetch it:

```bash
curl "http://localhost:8082/files/test-dataset.json"
```

Expected: `{"dataset":"test","records":[{"id":1}]}`

---

## Port reference

| Machine | Port | Service | Direction | Notes |
|---|---|---|---|---|
| Coordinator | 8000 | EITELCoordinator API | Inbound from both nodes | HTTP (or HTTPS with TLS) |
| Producer | 8090 | Handshake API | Inbound from Consumer, Coordinator | |
| Producer | 11000 | EDC default HTTP | Inbound | |
| Producer | 11002 | EDC management | Inbound (management only) | |
| Producer | 11003 | EDC DSP protocol | Inbound from Consumer EDC | |
| Consumer | 8091 | Handshake API | Inbound from Producer, Coordinator | |
| Consumer | 11010 | EDC default HTTP | Inbound | |
| Consumer | 11012 | EDC management | Inbound (management only) | |
| Consumer | 11013 | EDC DSP protocol | Inbound from Producer EDC | |
| Consumer | 8082 | Download sink | Localhost only (bound to 127.0.0.1) | |
| Producer | 3923 | Copyparty | Localhost only (bound to 127.0.0.1) | |
| Consumer | 3924 | Copyparty | Localhost only (bound to 127.0.0.1) | |

---

## Firewall rules

### Coordinator machine (Linux — ufw)

```bash
sudo ufw allow 8000/tcp comment "EITELCoordinator API"
sudo ufw enable
```

### Producer machine (Linux — ufw)

```bash
sudo ufw allow 8090/tcp  comment "EITEL handshake"
sudo ufw allow 11000/tcp comment "EDC default"
sudo ufw allow 11002/tcp comment "EDC management"
sudo ufw allow 11003/tcp comment "EDC DSP protocol"
sudo ufw enable
```

### Consumer machine (Linux — ufw)

```bash
sudo ufw allow 8091/tcp  comment "EITEL handshake"
sudo ufw allow 11010/tcp comment "EDC default"
sudo ufw allow 11012/tcp comment "EDC management"
sudo ufw allow 11013/tcp comment "EDC DSP protocol"
sudo ufw enable
```

### Windows Defender Firewall (PowerShell — run as Administrator)

On Coordinator:

```powershell
New-NetFirewallRule -DisplayName "EITELCoordinator" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
```

On Producer:

```powershell
foreach ($port in @(8090, 11000, 11002, 11003)) {
    New-NetFirewallRule -DisplayName "EITEL Producer $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow
}
```

On Consumer:

```powershell
foreach ($port in @(8091, 11010, 11012, 11013)) {
    New-NetFirewallRule -DisplayName "EITEL Consumer $port" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow
}
```

---

## Distributed mode vs. single-machine mode

The `eitel-coordinator` service in `eitel-node/docker-compose.producer.yml` is a convenience for running everything on one machine for development.

| Mode | What to do |
|---|---|
| **Single-machine** | Leave `eitel-coordinator` service enabled. Everything runs on localhost. |
| **Distributed (real machines)** | Comment out `eitel-coordinator` in `docker-compose.producer.yml`. Run EITELCoordinator separately on the Coordinator machine. |

When running distributed, also ensure:

- `EITEL_NODE_EDC_DSP_ENDPOINT` uses the Producer's LAN IP, not `edc-producer-control`
- `EDC_DSP_CALLBACK_ADDRESS` uses the Producer's LAN IP, not `edc-producer-control`
- Same for Consumer: use `CONSUMER_IP:11013`, not `edc-consumer-control:11013`

---

## Troubleshooting

### Coordinator: `/health` returns connection refused

- Is the coordinator process running? Check `ps aux | grep uvicorn`
- Is port 8000 open? `sudo ufw status` or check Windows Defender
- Did you use `--host 0.0.0.0`? Without it, uvicorn only listens on 127.0.0.1

### Handshake returns 403 or `{"status":"error"}`

Possible causes in order of likelihood:

1. **VC not loaded** — check `curl http://NODE_IP:PORT/identity`. If no VC path returned or it fails, `credential.json` is missing or unreadable.
2. **Wrong coordinator public key** — the `coordinator_pubkey.jwk` on the node must match the private key used to sign the VC. Re-export from `GET /public-key` and replace.
3. **DID mismatch** — the DID in `credential.json → credentialSubject.id` must match the node's current DID from `GET /identity`. Regenerating the node identity breaks existing VCs.
4. **Expired VC** — check `credentialSubject.expirationDate` if present.

### Handshake returns `"Failed to load coordinator JWK"`

The file at `EITEL_NODE_COORDINATOR_PUBKEY_JWK_PATH` doesn't exist or is not valid JSON. Check:

```bash
docker exec eitel-node-handshake-producer cat /keys/coordinator_pubkey.jwk
```

### EDC negotiation stuck / no catalog returned

- Check that `EDC_DSP_CALLBACK_ADDRESS` uses the LAN IP, not an internal Docker hostname. The producer's EDC must be reachable from the consumer using this address.
- Verify: `curl http://PRODUCER_IP:11003/api/protocol/.well-known/dspace-version` returns a version string.

### EDC negotiation stuck at AGREEING (Windows / Docker Desktop)

**Symptom**: the Producer's EDC receives the negotiation and reaches state `AGREEING`, but never advances to `AGREED`. The Consumer stays in `REQUESTED`.

**Cause**: a Docker bridge network on the Producer machine has a subnet that overlaps with the physical LAN. The Linux kernel routes packets for the Consumer's IP into the Docker bridge instead of out the real network interface, so the Producer's EDC can never call back to the Consumer.

**Diagnose**: from the Producer, test whether the EDC container can reach the Consumer's DSP port:

```bash
docker exec eitel-node-edc-producer sh -c \
  "curl -s --connect-timeout 5 -o /dev/null -w '%{http_code}' \
   http://CONSUMER_IP:11013/api/protocol/2025-1/.well-known/dspace-version"
```

If this times out or returns `No route to host`, there is a subnet conflict. Find the offending network:

```powershell
# PowerShell — lists all Docker networks whose subnet overlaps the LAN
docker network ls --format "{{.ID}} {{.Name}}" | ForEach-Object {
    $id, $name = $_ -split ' ', 2
    $subnet = docker network inspect $id --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
    "$name  ->  $subnet"
}
```

Look for any network with a subnet that covers your `LAN_IP` range (e.g. `172.20.0.0/16` covering a LAN on `172.20.10.0/28`). If the offending network belongs to a leftover container from earlier local testing, stop that container and remove the network:

```bash
docker stop <container>
docker rm <container>
docker network rm <network-name>
```

**WSL2 mirrored networking (Windows — recommended)**: create `%USERPROFILE%\.wslconfig` with the following content, then restart WSL2 (`wsl --shutdown`) and Docker Desktop. This makes WSL2 use the host's real network interfaces and reduces the chance of future subnet conflicts:

```ini
[wsl2]
networkingMode=mirrored
```

### Transfer stuck in REQUESTED or TERMINATED

- **REQUESTED but not progressing**: dataplane may not have registered. Check `GET http://PRODUCER_IP:11002/api/management/v3/dataplanes` returns at least one entry.
- **TERMINATED**: the data sink URL isn't reachable. `TransferSinkBaseUrl` must be a URL the Producer EDC can POST to. `eitel-node-download-sink-consumer:8082` only resolves inside the Docker network — use the Consumer's LAN IP if calling across machines.
- Fetch error details: `GET http://CONSUMER_IP:11012/api/management/v3/transferprocesses/TRANSFER_ID` and check `errorDetail`.

### TLS: `curl` fails with certificate error

Use `-k` to skip verification for self-signed certs:

```bash
curl -k https://COORDINATOR_IP:8000/health
```

PowerShell:

```powershell
Invoke-RestMethod -Uri "https://COORDINATOR_IP:8000/health" -SkipCertificateCheck
```
