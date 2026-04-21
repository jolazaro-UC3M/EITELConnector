# EITEL PoC Transfer — Full Runbook

**Project:** Project Star — EITEL Distribuido  
**Author:** jolazaro-UC3M  
**Last updated:** 2026-04-21  
**Status:** Aligned with current `eitel-node` implementation

---

## Overview

This runbook documents the validated transfer path for the PoC:

1. Consumer authenticates to Producer using `POST /handshake/initiate`
2. Producer validates Consumer VC and issues a session token
3. Consumer calls `POST /transfer/download` on Producer with that token
4. Producer proxies the file bytes from internal Copyparty and streams to Consumer

In this architecture, Copyparty is internal-only. The handshake service is the network-facing gatekeeper for identity and file access.

---

## Architecture Wiring

Each node runs:

- `eitel-node-handshake-{producer|consumer}` (FastAPI, public in LAN)
- `eitel-node-copyparty-{producer|consumer}` (Copyparty, internal backend)

Producer stack wiring:

- Handshake container exposes `:8080`
- Copyparty container serves `:3923` **inside Docker network**
- Handshake reaches Copyparty via `COPYPARTY_URL=http://copyparty:3923`
- Host mapping `127.0.0.1:3923:3923` exists for diagnostics, but transfer flow uses internal service-to-service routing

Consumer stack wiring:

- Handshake container exposes `:8081`
- Copyparty container serves `:3923` internally (`127.0.0.1:3924` on host)

Copyparty startup command (both stacks):

```bash
python3 -m copyparty -p 3923 -v /data:/files:rw,eitel -a eitel:${COPYPARTY_PASSWORD} -e2dsa
```

---

## Endpoints Used for Transfer

- `GET /health` on both nodes (retrieve DIDs, readiness)
- `POST /handshake/initiate` on Producer (`:8080`) from Consumer identity
- `POST /transfer/download` on Producer (`:8080`) with `Authorization: Bearer <session_token>`

`/transfer/download` request body:

```json
{
  "file_path": "test-dataset.json"
}
```

Important behaviors implemented in code:

- Token must be valid and have audience `handshake`
- Path traversal (`..`) is rejected
- Producer proxies from Copyparty path `/files/<file_path>?pw=<COPYPARTY_PASSWORD>`
- Response is streamed with `Content-Disposition: attachment`

---

## Prerequisites

- Docker Desktop running
- `uv` installed (Coordinator startup)
- Repositories:
  - `C:\Users\Jorge\Documents\star\EITELCoordinator`
  - `C:\Users\Jorge\Documents\star\EITELConnector\eitel-node`
- Coordinator public key mounted in both node compose files (`./keys/coordinator_pubkey.jwk`)

---

## One-Command Automation

Use the transfer automation script:

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-trasnfer.ps1
```

Useful options:

```powershell
# Reuse an already-running Coordinator
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-trasnfer.ps1 -SkipCoordinatorStart

# Skip docker image rebuilds
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-trasnfer.ps1 -NoBuild

# Stop stacks when successful
powershell -ExecutionPolicy Bypass -File .\scripts\run-poc-trasnfer.ps1 -TeardownOnSuccess
```

The script writes:

- Downloaded file: `eitel-node/.runbook-artifacts/downloaded-test-dataset.json`
- Execution artifact: `eitel-node/.runbook-artifacts/transfer-run-<timestamp>.json`

---

## Manual Procedure (Step by Step)

### 1) Start Coordinator

```powershell
cd C:\Users\Jorge\Documents\star\EITELCoordinator
uv run fastapi dev src/coordinator/main.py
```

Wait for `Application startup complete`.

### 2) Start Producer and Consumer Stacks

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
docker compose -f docker-compose.producer.yml up -d --build
docker compose -f docker-compose.consumer.yml up -d --build
```

Verify containers:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"
```

Expected handshake ports:

- Producer handshake on `0.0.0.0:8080->8080/tcp`
- Consumer handshake on `0.0.0.0:8081->8080/tcp`

### 3) Get DIDs

```powershell
$healthP = Invoke-RestMethod -Uri "http://localhost:8080/health" -Method Get
$healthC = Invoke-RestMethod -Uri "http://localhost:8081/health" -Method Get
$NODE_P_DID = $healthP.node_did
$NODE_C_DID = $healthC.node_did
```

### 4) Issue VCs from Coordinator

```powershell
$VC_P = Invoke-RestMethod -Uri "http://localhost:8000/credentials" -Method Post -ContentType "application/json" -Body (@{
  participantName = "UC3M Producer"
  participantId   = "node-p"
  did             = $NODE_P_DID
  role            = "producer"
} | ConvertTo-Json)

$VC_C = Invoke-RestMethod -Uri "http://localhost:8000/credentials" -Method Post -ContentType "application/json" -Body (@{
  participantName = "UC3M Consumer"
  participantId   = "node-c"
  did             = $NODE_C_DID
  role            = "consumer"
} | ConvertTo-Json)
```

### 5) Seed Test Data in Producer Copyparty

```powershell
docker exec eitel-node-copyparty-producer sh -c 'printf "{\"dataset\":\"project-star\",\"version\":1}\n" > /data/test-dataset.json'
```

### 6) Consumer Handshake with Producer (C -> P)

```powershell
$resultCtoP = Invoke-RestMethod -Uri "http://localhost:8080/handshake/initiate" -Method Post -ContentType "application/json" -Body (@{
  did       = $NODE_C_DID
  eitel_vc  = $VC_C
  gaia_x_vp = $null
} | ConvertTo-Json -Depth 10)

$TOKEN_CtoP = $resultCtoP.session_token
```

Expected: `$resultCtoP.status` is `ok`.

### 7) Consumer Downloads from Producer

```powershell
$downloadPath = ".\.runbook-artifacts\manual-downloaded-test-dataset.json"
New-Item -Path ".\.runbook-artifacts" -ItemType Directory -Force | Out-Null

Invoke-WebRequest `
  -Uri "http://localhost:8080/transfer/download" `
  -Method Post `
  -Headers @{ Authorization = "Bearer $TOKEN_CtoP" } `
  -ContentType "application/json" `
  -Body (@{ file_path = "test-dataset.json" } | ConvertTo-Json) `
  -OutFile $downloadPath
```

Validate result:

```powershell
Get-Item $downloadPath | Select-Object FullName, Length, LastWriteTime
Get-Content $downloadPath
```

If file exists and has expected payload, transfer is successful.

---

## Offline Validation (Coordinator Independence)

To prove transfer does not depend on Coordinator after trust establishment:

1. Complete steps through handshake (token obtained)
2. Stop Coordinator
3. Run the transfer request again with the issued token

Expected: transfer still succeeds while token remains valid (`EITEL_NODE_SESSION_TOKEN_TTL`).

---

## Troubleshooting

- `401 Missing Authorization header`: ensure `Authorization: Bearer <token>`
- `401 Invalid token audience`: token must come from `/handshake/initiate` (audience `handshake`)
- `404 File not found in Copyparty`: file missing at Producer `/data/<file_path>`
- `502 Copyparty connection failed`: Producer handshake cannot reach internal `copyparty` service
- `400 Invalid path`: remove `..` from `file_path`

---

## Teardown

```powershell
cd C:\Users\Jorge\Documents\star\EITELConnector\eitel-node
docker compose -f docker-compose.producer.yml down
docker compose -f docker-compose.consumer.yml down
```

Stop Coordinator terminal with `Ctrl+C`.

