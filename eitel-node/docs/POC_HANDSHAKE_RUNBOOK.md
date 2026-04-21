# EITEL PoC Handshake — Full Runbook

**Project:** Project Star — EITEL Distribuido  
**Author:** jolazaro-UC3M
**Last updated:** 2026-04-20  
**Status:** Validated end-to-end on 2026-04-17

---

## Overview

This document describes the complete procedure to bring up the EITEL PoC
handshake environment locally and execute a mutual authentication between
two nodes (Producer and Consumer). It is written for anyone picking this
up cold.

The environment has three moving parts:

```
┌─────────────────────────────────────────────────────┐
│                  EITELCoordinator                   │
│          FastAPI · http://localhost:8000             │
│  Issues Verifiable Credentials (VCs) to nodes       │
│  Hosts the public key used to verify those VCs      │
└─────────────────────────────────────────────────────┘
         │ POST /credentials (issues VC)
         │
    ┌────┴─────────────────────────────────┐
    │                                      │
    ▼                                      ▼
┌──────────┐   POST /handshake/initiate   ┌──────────┐
│  Node P  │ ◄─────────────────────────── │  Node C  │
│ Producer │                              │ Consumer │
│ :8080    │ ─────────────────────────── ►│ :8081    │
└──────────┘   POST /handshake/initiate   └──────────┘
```

Each node runs two Docker containers:
- `eitel-node-handshake-{producer|consumer}` — FastAPI handshake service
- `eitel-node-copyparty-{producer|consumer}` — data sharing service (copyparty)

---

## Prerequisites

- Docker Desktop running
- `uv` installed (for the Coordinator)
- Three PowerShell terminals open simultaneously
- Repos cloned:
  - `jolazaro-UC3M/EITELCoordinator` → `C:\Users\Jorge\Documents\star\EITELCoordinator`
  - `mariwogr/EITELConnector` (eitel-node subfolder) → `C:\Users\Jorge\Documents\star\EITELConnector\eitel-node`

---

## Automated Execution (One Command)

You can run the complete flow (Coordinator startup, both compose stacks, VC issuance,
P→C handshake, C→P handshake, and peer verification) with:

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-handshake.ps1
```

Useful options:

```powershell
# Coordinator already running on :8000
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-handshake.ps1 -SkipCoordinatorStart

# Skip docker image rebuilds for faster iterations
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-handshake.ps1 -NoBuild

# Teardown producer/consumer containers at the end
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-handshake.ps1 -TeardownOnSuccess
```

The script writes a JSON artifact in `eitel-node/.runbook-artifacts/` with the
execution timestamp, both DIDs, handshake statuses, and verification result.

---

## Critical: Docker Compose Project Naming

Both compose files (`docker-compose.producer.yml` and
`docker-compose.consumer.yml`) live in the same `eitel-node/` directory.
Docker Compose defaults to using the **directory name** as the project name.
If both files share the same project name, running the second one will
**recreate and overwrite the first one's containers** instead of adding new
ones alongside.

**The fix:** each compose file must declare its own `name:` at the top.

`docker-compose.producer.yml` must begin with:
```yaml
name: eitel-producer

services:
  ...
```

`docker-compose.consumer.yml` must begin with:
```yaml
name: eitel-consumer

services:
  ...
```

Without this, you will only ever have two containers running, not four.
This was the primary blocker on 2026-04-17.

---

## Step-by-Step Procedure

### Terminal 1 — Start the Coordinator

The Coordinator must be up before anything else. It is the trust authority
that issues Verifiable Credentials to the nodes.

```powershell
cd C:\Users\Jorge\Documents\star\EITELCoordinator
uv run fastapi dev src/coordinator/main.py
```

Wait for the line:
```
INFO:     Application startup complete.
```

Leave this terminal open and untouched for the entire session.

---

### Terminal 2 — Start Node P (Producer)

Node P represents the data-producing participant. It runs on port 8080.

#### 1. Update docker-compose.producer.yml

The session token secret must be hardcoded in the docker-compose file. Edit
`docker-compose.producer.yml` and update the `EITEL_NODE_SESSION_TOKEN_SECRET`
environment variable in the handshake service:

```yaml
environment:
  - EITEL_NODE_SESSION_TOKEN_SECRET=poc-secret-node-P-change-me
```

> Do NOT use `$env:` syntax or `.env` files with env_file directive as they
> do not reliably pass environment variables to containers. Hardcoding in the
> docker-compose file is the most reliable approach for this PoC.

#### 2. Start the containers

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
docker compose -f docker-compose.producer.yml up --build
```

Docker will build the image and start two containers:
- `eitel-node-handshake-producer` (exposed on `:8080`)
- `eitel-node-copyparty-producer`

Wait for:
```
eitel-node-handshake-producer | INFO: Application startup complete.
```

#### 3. Retrieve Node P's DID

Every node generates a DID (Decentralised Identifier) at startup. It is
exposed via the `/health` endpoint and is unique to each container
lifecycle — it changes on every fresh start unless identity is persisted
(see Known Limitations).

```powershell
$healthP    = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get
$NODE_P_DID = $healthP.node_did
Write-Host "Node P DID: $NODE_P_DID"
```

Copy the printed DID. You will need it in Terminal 3.

#### 4. Request a Verifiable Credential from the Coordinator

The Coordinator issues an `EITELParticipantCredential` that certifies this
node as a legitimate participant in the EITEL data space. This credential
is presented during the handshake so the other node can verify it.

```powershell
$VC_P = Invoke-RestMethod `
    -Uri "http://localhost:8000/credentials" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
        participantName = "UC3M Producer"
        participantId   = "node-p"
        did             = $NODE_P_DID
        role            = "producer"
    } | ConvertTo-Json)

Write-Host "VC_P type: $($VC_P.type)"
```

Expected output:
```
VC_P type: VerifiableCredential EITELParticipantCredential
```

Leave Terminal 2 open. `$NODE_P_DID` and `$VC_P` live here.

---

### Terminal 3 — Start Node C (Consumer)

Node C represents the data-consuming participant. It runs on port 8081.
Follow the same sequence as Terminal 2, with consumer values.

#### 1. Update docker-compose.consumer.yml

Edit `docker-compose.consumer.yml` and update the `EITEL_NODE_SESSION_TOKEN_SECRET`
environment variable in the handshake service:

```yaml
environment:
  - EITEL_NODE_SESSION_TOKEN_SECRET=poc-secret-node-C-change-me
```

#### 2. Start the containers

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
docker compose -f docker-compose.consumer.yml up --build
```

Wait for:
```
eitel-node-handshake-consumer | INFO: Application startup complete.
```

#### 3. Retrieve Node C's DID

```powershell
$healthC    = Invoke-RestMethod -Uri "http://localhost:8081/health" -Method Get
$NODE_C_DID = $healthC.node_did
Write-Host "Node C DID: $NODE_C_DID"
```

Copy the printed DID. You will need it in Terminal 2.

#### 4. Request a Verifiable Credential from the Coordinator

```powershell
$VC_C = Invoke-RestMethod `
    -Uri "http://localhost:8000/credentials" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
        participantName = "UC3M Consumer"
        participantId   = "node-c"
        did             = $NODE_C_DID
        role            = "consumer"
    } | ConvertTo-Json)

Write-Host "VC_C type: $($VC_C.type)"
```

Expected output:
```
VC_C type: VerifiableCredential EITELParticipantCredential
```

Leave Terminal 3 open. `$NODE_C_DID` and `$VC_C` live here.

---

### Verify all four containers are running

Before proceeding to handshakes, confirm Docker has all four containers up.
Run this in any PowerShell:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
```

Expected output:
```
NAMES                            PORTS                      STATUS
eitel-node-handshake-producer    0.0.0.0:8080->8080/tcp     Up X minutes
eitel-node-copyparty-producer    127.0.0.1:3923->3923/tcp   Up X minutes
eitel-node-handshake-consumer    0.0.0.0:8081->8080/tcp     Up X minutes
eitel-node-copyparty-consumer    127.0.0.1:3924->3923/tcp   Up X minutes
```

If only two are shown, the project naming fix was not applied. See the
"Critical: Docker Compose Project Naming" section above.

The `(unhealthy)` status on copyparty containers is a known cosmetic issue
— `curl` is not installed in the Python slim image used for the healthcheck.
It does not affect functionality.

---

### Handshake Phase

The handshake is a mutual authentication protocol. Each node calls
`POST /handshake/initiate` on the **other** node, presenting its own DID
and its Verifiable Credential. The receiving node verifies the VC against
the Coordinator's public key and, if valid, registers the caller as a peer
and returns a signed session token.

Both directions must be completed for full mutual authentication.

#### Terminal 2 — Node P initiates handshake with Node C

Node P calls Node C's handshake endpoint (port 8081), presenting P's
identity and credential.

First, paste Node C's DID (printed in Terminal 3):
```powershell
$NODE_C_DID = "did:key:z6Mk..."   # paste from Terminal 3
```

Then initiate:
```powershell
$resultPtoC = Invoke-RestMethod `
    -Uri "http://localhost:8081/handshake/initiate" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
        did        = $NODE_P_DID
        eitel_vc   = $VC_P
        gaia_x_vp  = $null
    } | ConvertTo-Json -Depth 10)

Write-Host "Status: $($resultPtoC.status)"
Write-Host "Token:  $($resultPtoC.session_token)"
```

Expected:
```
Status: ok
Token:  eyJhbGci...
```

The token (`$resultPtoC.session_token`) is Node P's session token for
communicating with Node C. It lives only in Terminal 2.

#### Terminal 3 — Node C initiates handshake with Node P

Node C calls Node P's handshake endpoint (port 8080), presenting C's
identity and credential.

First, paste Node P's DID (printed in Terminal 2):
```powershell
$NODE_P_DID = "did:key:z6Mk..."   # paste from Terminal 2
```

Then initiate:
```powershell
$resultCtoP = Invoke-RestMethod `
    -Uri "http://localhost:8080/handshake/initiate" `
    -Method Post `
    -ContentType "application/json" `
    -Body (@{
        did        = $NODE_C_DID
        eitel_vc   = $VC_C
        gaia_x_vp  = $null
    } | ConvertTo-Json -Depth 10)

Write-Host "Status: $($resultCtoP.status)"
Write-Host "Token:  $($resultCtoP.session_token)"
```

Expected:
```
Status: ok
Token:  eyJhbGci...
```

The token (`$resultCtoP.session_token`) is Node C's session token for
communicating with Node P. It lives only in Terminal 3.

---

### Verification Phase

Confirm each node has registered the other as an active peer.

#### Terminal 2 — Check Node C's peer registry (P's token used against C)

```powershell
$TOKEN_PtoC = $resultPtoC.session_token

$statusFromC = Invoke-RestMethod `
    -Uri "http://localhost:8081/status" `
    -Method Get `
    -Headers @{ "Authorization" = "Bearer $TOKEN_PtoC" }

$statusFromC | ConvertTo-Json -Depth 5
```

Expected: `registered_peers` contains Node P's DID with `"status": "active"`.

#### Terminal 3 — Check Node P's peer registry (C's token used against P)

```powershell
$TOKEN_CtoP = $resultCtoP.session_token

$statusFromP = Invoke-RestMethod `
    -Uri "http://localhost:8080/status" `
    -Method Get `
    -Headers @{ "Authorization" = "Bearer $TOKEN_CtoP" }

$statusFromP | ConvertTo-Json -Depth 5
```

Expected: `registered_peers` contains Node C's DID with `"status": "active"`.

Both returning `active` = mutual authentication complete. ✅

---

## Session Scoping — Important Rule

PowerShell variables only live in the terminal session that created them.

| Variable | Lives in | Used for |
|---|---|---|
| `$NODE_P_DID`, `$VC_P`, `$resultPtoC` | Terminal 2 | Node P's identity and P→C token |
| `$NODE_C_DID`, `$VC_C`, `$resultCtoP` | Terminal 3 | Node C's identity and C→P token |

**Never** run a status check from the wrong terminal — the token variable
will be empty and the request will fail with `Missing Authorization header`.
If in doubt, `Write-Host` the token first to confirm it is populated.

---

## Known Limitations (PoC Only)

### 1. DIDs are not persistent

**STATUS: RESOLVED in v0.1.1**

DIDs now persist across container restarts through host filesystem volume mounts. The identity
directory is mounted to `./identity/producer` and `./identity/consumer` (host paths), ensuring
DIDs survive container lifecycle events. Do NOT run `docker compose down -v` or `docker volume prune`
as they will delete persisted identities.

If you delete the `./identity/` directory manually, a new DID will be generated on next startup.

### 2. GAIA-X VP is absent

The handshake accepts `gaia_x_vp: null` for the PoC. Both nodes report
`"gx_vp_status": "absent"`. Before production or Carla's security review,
each node must present a real GAIA-X Verifiable Presentation signed by an
accredited GAIA-X Digital Clearing House (GXDCH) issuer.

**Future Integration:** Set `EITEL_NODE_GXDCH_ENDPOINT` environment variable to point to a GXDCH
endpoint (e.g., `https://gxdch.eiteldata.eu/vp/issue`). Configuration template:

```yaml
environment:
  - EITEL_NODE_GXDCH_ENDPOINT=https://gxdch.eiteldata.eu/vp/issue
```

### 3. Copyparty healthcheck reports unhealthy

**STATUS: RESOLVED in v0.1.1**

Healthcheck now uses Python HTTP client instead of missing `curl` binary. Both copyparty containers
report `Up X minutes` (healthy) when running.

### 4. Session Token Validation Issue (CURRENT BLOCKER)

**STATUS: RESOLVED in v0.1.1**

Cross-node token validation now works. Each handshake includes the issuer node's DID in the token
claims. The `/status` endpoint automatically detects cross-node tokens and validates using the
issuer's Ed25519 public key (extracted from the DID), eliminating the need for shared secrets.

**How it works:**
1. Node A calls Node B's `/handshake/initiate` → receives token issued by Node B
2. Node A uses that token at Node B's `/status` endpoint
3. `/status` extracts issuer DID from token and validates using issuer's public key
4. Peer registration succeeds with `"status": "active"`

**New Endpoint:** `GET /public-key` returns this node's Ed25519 public key in JWK format (RFC 8037).

### 5. Environment Variable Configuration

**STATUS: RESOLVED in v0.1.1**

Session tokens are now signed with Ed25519 (using the node's cryptographic identity), eliminating the need for
a shared `EITEL_NODE_SESSION_TOKEN_SECRET`. All configuration is now loaded automatically from environment variables
with the `EITEL_NODE_` prefix, and the application enforces proper Ed25519 key management.

For future reference, when passing secrets via environment variables to Docker containers, hardcode them directly
in the docker-compose.yml `environment` section rather than using PowerShell `$env:` syntax or `.env` files:

```yaml
environment:
  - EITEL_NODE_COORDINATOR_PUBKEY_JWK_PATH=/keys/coordinator_pubkey.jwk
  - EITEL_NODE_EDC_API_KEY=your-api-key-here
```

This approach is more reliable for Docker Compose configurations.

---

## Important Notes on Volume Cleanup

To preserve persisted identities during development:

```powershell
# Safe teardown (preserves identity and data directories)
docker compose -f docker-compose.producer.yml down
docker compose -f docker-compose.consumer.yml down
```

To start fresh (delete all state including identities):

```powershell
# Dangerous: removes all containers AND volumes
docker compose -f docker-compose.producer.yml down -v
docker compose -f docker-compose.consumer.yml down -v
rm -r identity/  # Also delete host filesystem mounts
```

---

## What Changed in v0.1.1

This section summarizes the architectural improvements from the previous PoC version:

### Session Token Architecture (Major Change)
- **Before:** Tokens signed with HMAC-SHA256 using a per-node secret; cross-node validation failed because each node had a different secret
- **Now:** Tokens signed with Ed25519 using each node's private key; verified using issuer's public key extracted from DID
- **Benefit:** Enables true cross-node authentication without shared secrets

### New Endpoints
- `GET /public-key` — Returns node's Ed25519 public key in JWK format (RFC 8037) for external verification
- Token validation automatically handles both same-node and cross-node tokens transparently

### Infrastructure Improvements
- Identity directory now persists on host filesystem (`./identity/producer`, `./identity/consumer`) instead of volatile Docker volumes
- Copyparty healthcheck uses Python HTTP client, eliminating dependency on `curl` binary
- Global exception handler in FastAPI app converts token validation errors to proper 401 HTTP responses

### Configuration Changes
- `SessionTokenManager` now requires `node_identity` instead of `secret`
- `EITEL_NODE_SESSION_TOKEN_SECRET` no longer used (removed from docker-compose files)
- Cleaner separation of concerns: identity management handled by node, tokens signed cryptographically

---

## Teardown

To stop and remove all PoC containers cleanly (preserving identities):

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
docker compose -f docker-compose.producer.yml down
docker compose -f docker-compose.consumer.yml down
```

The Coordinator (Terminal 1) can be stopped with `Ctrl+C`.

To perform a complete reset (including deleting all persisted state):

```powershell
docker compose -f docker-compose.producer.yml down -v
docker compose -f docker-compose.consumer.yml down -v
rm -r identity/  # Delete host filesystem mounts
```

