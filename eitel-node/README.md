# EITEL Node: Self-Hostable GAIA-X Participant

A federated dataspace participant node implementing the **EITEL dual-VC trust handshake**. Two institutions on a LAN can negotiate and execute data transfers directly—**without EITEL as intermediary**.

This is a **proof-of-concept** for Project Star (Fase Estrella), demonstrating that GAIA-X principles and dataspace protocols enable direct peer-to-peer data exchange.

---

## What is eitel-node?

**Three-layer architecture:**

1. **Handshake Service (FastAPI)** — Verifies institutional identity via dual-VC handshake, issues session tokens
2. **EDC (Eclipse Dataspace Connector)** — Negotiates contracts and transfers via DSP (Dataspace Protocol)
3. **copyparty** — P2P file store backend (WebRTC on LAN)

Each node runs as a Docker Compose stack. On startup:
- Generates a Ed25519 keypair and derives a `did:key` (no domain required)
- Exposes `/handshake/initiate` endpoint for peer trust establishment
- Connects to EDC for asset cataloguing and DSP negotiation

---

## Quick Start (PoC on Single Machine)

### Prerequisites

- Docker + Docker Compose (v2.20+ for `include:` directive, or skip Option A)
- 2+ GB RAM, 1+ GB free disk
- Git

### Setup

1. **Clone and navigate:**
   ```bash
   git clone https://github.com/jolazaro-UC3M/EITELConnector.git
   cd EITELConnector/eitel-node
   ```

2. **Generate session token secret:**
   ```bash
   openssl rand -base64 32
   # Output: abc123def456... (copy this)
   ```

3. **Copy environment template and configure:**
   ```bash
   cp .env.example .env
   # Edit .env and paste the generated secret into EITEL_NODE_SESSION_TOKEN_SECRET=
   ```

4. **Place coordinator public key:**
   ```bash
   # Obtain from EITELCoordinator (UC3M deployment)
   # Save to: keys/coordinator_pubkey.pem
   cp /path/to/coordinator-ed25519-pub.pem keys/coordinator_pubkey.pem
   ```

5. **Start the stack:**

   **Option A (include caas/ if available):**
   ```bash
   # Uncomment the include: section in docker-compose.yml
   # Ensure caas/ is a sibling directory
   docker compose up -d
   ```

   **Option B (external EDC):**
   ```bash
   # Set EDC URL in .env, then:
   docker compose up -d
   ```

6. **Verify health:**
   ```bash
   curl http://localhost:8080/health
   # Response: {"status":"ok","service":"eitel-node-handshake","node_did":"did:key:z6Mk..."}
   
   curl http://localhost:3923/
   # Response: copyparty web UI (or 200 OK from API)
   ```

---

## PoC Scenario: Two Nodes on LAN

**Setup:**
- Machine A (UC3M LAN): runs `docker compose up` from eitel-node/
- Machine B (UC3M LAN): runs `docker compose up` from a separate eitel-node/ clone

**Flow:**

1. **Mutual trust establishment:**
   ```bash
   # On Machine A: call Machine B's handshake endpoint
   curl -X POST http://machineB:8080/handshake/initiate \
     -H "Content-Type: application/json" \
     -d '{
       "did": "did:key:z6MkiXXXXXNodeA",
       "eitel_vc": {
         "@context": [...],
         "issuer": "did:key:z6MkuCoordinator",
         "credentialSubject": { "id": "did:key:z6MkiXXXXXNodeA", "expirationDate": "2026-04-16T00:00:00Z" },
         "proof": { "type": "Ed25519Signature2020", "signatureValue": "..." }
       },
       "gaia_x_vp": { ... }  # Optional
     }'
   
   # Response:
   # {
   #   "status": "ok",
   #   "session_token": "eyJhbGci...",
   #   "node_did": "did:key:z6MkuXXXXXNodeB",
   #   "peer_did": "did:key:z6MkiXXXXXNodeA",
   #   "gx_vp_status": "valid|absent|invalid_...",
   #   "dsp_endpoint": "http://machineB:11003/api/v1/dsp"
   # }
   ```

2. **EDC asset negotiation:**
   - Machine A's EDC uses the `dsp_endpoint` from handshake response to initiate DSP negotiation with Machine B's EDC
   - Both EDCs negotiate contract terms (asset, policy, transfer modality)
   - No further involvement of handshake service

3. **P2P data transfer:**
   - copyparty on Machine B serves files (via internal EDC data plane configuration)
   - Machine A's EDC transfers files to Machine A's copyparty via direct WebRTC P2P connection on LAN
   - **No cloud intermediary, no central EITEL involved**

4. **Verify peer registry:**
   ```bash
   curl http://machineB:8080/status
   # Shows registered peers, last handshake, GX VP status
   ```

---

## Configuration

### Environment Variables (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `EITEL_NODE_COORDINATOR_PUBKEY_PATH` | `/keys/coordinator_pubkey.pem` | Path to EITELCoordinator's Ed25519 public key |
| `EITEL_NODE_NODE_IDENTITY_DIR` | `/identity` | Where to persist this node's did:key + keypair |
| `EITEL_NODE_EDC_MANAGEMENT_URL` | `http://edc-control:8182` | EDC management API URL (external or via caas/) |
| `EITEL_NODE_EDC_API_KEY` | `change-me` | EDC management API auth key |
| `EITEL_NODE_EDC_DSP_ENDPOINT` | `http://localhost:11003/api/v1/dsp` | EDC DSP URL (returned to peers) |
| `EITEL_NODE_SESSION_TOKEN_TTL` | `3600` | Session token lifetime (seconds) |
| `EITEL_NODE_SESSION_TOKEN_SECRET` | *(required)* | HMAC-SHA256 signing secret (generate with `openssl rand -base64 32`) |

### Coordinator Public Key

Place the EITELCoordinator's Ed25519 public key in PEM format at `keys/coordinator_pubkey.pem`:

```
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA...base64_encoded_public_key...
-----END PUBLIC KEY-----
```

**Do not commit real keys.** Only `.gitkeep` is tracked; `.gitignore` excludes `.pem` files.

---

## API Endpoints

### Handshake

**POST /handshake/initiate**
- Dual-VC trust establishment
- Request: `{ did, eitel_vc, gaia_x_vp? }`
- Response: `{ status, session_token, node_did, peer_did, gx_vp_status, dsp_endpoint }`
- Errors: 400 (Bad Request), 401 (Unauthorized)

See `docs/PROTOCOL.md` for full message schemas.

### Status & Tickets

**GET /status**
- Node identity, peer registry, last handshake
- Response: `{ node_did, last_handshake, gx_vp_status, registered_peers }`

**GET /handshake/ticket**
- Exchange session token for one-time WebSocket upgrade ticket (future use)
- Request header: `Authorization: Bearer <session_token>`
- Response: `{ ticket, expires_in }`

### Health

**GET /health**
- Simple readiness probe
- Response: `{ status: "ok", service, node_did }`

---

## Known Limitations (PoC Scope)

1. **Identity: `did:key` only** — No domain binding (`did:web`). Simpler for PoC; production requires TLS cert.
2. **GX VP validation: best-effort** — Full GAIA-X compliance chain unreachable at `compliance.eiteldata.eu` (TLS mismatch). UC3M/Fuenlabrada VPs treated as "near-production" artefacts.
3. **P2P on LAN only** — copyparty WebRTC works without port forwarding on LAN. Production requires STUN/TURN for internet routing.
4. **Session tokens: 1-hour TTL** — No revocation list. Short-lived by design.
5. **No EDC data plane** — Transfer execution is stub; EDC control plane only in PoC.

---

## Future Work (Production Path)

- **did:web**: Replace `did:key` with institution domain binding + TLS cert
- **Full GX compliance**: Resolve TLS chain issue or use alternative credential provider
- **NAT traversal**: Implement STUN/TURN for cross-site P2P
- **HTTPS**: Handshake service behind TLS reverse proxy
- **Persistent peer registry**: Database for handshake history and peer state
- **Multi-policy**: EDC integration for negotiating complex data access policies
- **EDC data plane**: Complete transfer execution (not just initiation)

---

## Architecture Diagrams & Details

See `docs/ARCHITECTURE.md` for three-layer architecture, caas/ relationship, threat model, and production migration paths.

---

## Troubleshooting

### Containers won't start
```bash
# Check logs
docker compose logs handshake
docker compose logs copyparty

# Verify volumes mounted
docker inspect eitel-node-handshake | grep Mounts
```

### VC validation fails
- Verify `keys/coordinator_pubkey.pem` exists and is correct PEM format
- Check VC issuer matches configured coordinator DID
- Check VC expiration date is in future

### Session token errors
- Verify `EITEL_NODE_SESSION_TOKEN_SECRET` is set to a strong value
- Check Bearer token format: `Authorization: Bearer <token>`

### Copyparty not accessible
- Verify port 3923 is not blocked locally
- Check `docker ps` — container should be running
- Try: `curl http://localhost:3923/`

---

## Contributing

This is a PoC branch: `feature/eitel-node-poc`. For production adoption, see migration paths in `docs/ARCHITECTURE.md`.

---

## License & Attribution

Part of the EITEL Dataspace project. Uses:
- **FastAPI** for handshake service
- **cryptography** for Ed25519 signatures
- **PyJWT** for session tokens
- **copyparty** for P2P file transfer
- **Eclipse Dataspace Connector** for DSP protocol

---

## Contact

For PoC questions or integration with UC3M LAN deployment: contact jolazaro@uc3m.es
