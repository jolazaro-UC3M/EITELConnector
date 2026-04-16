# EITEL Node Architecture

## Overview

**eitel-node** is a self-hostable GAIA-X participant node for federated dataspace interchange. It implements a three-layer stack: handshake (identity), EDC (protocol), and copyparty (storage).

This document explains:
- The three-layer architecture and why each layer exists
- How eitel-node relates to Mario's `caas/` (complementary, not replacement)
- Migration path from PoC (`did:key`) to production (`did:web`)
- Threat model and out-of-scope production considerations

---

## Three-Layer Architecture

### Layer 1: Handshake Service (Trust Gate)

**Purpose:** Establish mutual trust between peers before DSP negotiation.

**Technology:** FastAPI (Python)

**Responsibilities:**
- Generate and persist this node's Ed25519 keypair (on first start)
- Derive `did:key` multibase DID from public key
- Validate peer's EITEL VC (Ed25519 signature against static coordinator pubkey)
- Optionally validate peer's GAIA-X VP (best-effort, non-blocking)
- Issue short-lived JWT session tokens
- Proxy peer access to EDC catalogue and copyparty file browser

**Data Flow:**
```
Peer A (HTTP)
    |
    POST /handshake/initiate
    { did, eitel_vc, gaia_x_vp? }
    |
    v
[Handshake Service]
    |
    +-- validate EITEL VC (Ed25519 signature)
    +-- check expiration
    +-- bind to peer DID
    +-- validate GX VP (best-effort)
    +-- issue session JWT
    |
    v
Peer A (HTTP)
    { session_token, node_did, dsp_endpoint }
```

**Why separate from EDC?**
- EDC implements DSP (asset cataloguing, contract negotiation); handshake implements institutional identity
- Trust establishment is orthogonal to protocol negotiation
- Session tokens gate HTTP APIs; DSP uses different auth (mutual TLS or DSP-level mechanisms)
- Allows testing identity validation independently of EDC deployment

### Layer 2: EDC (Protocol)

**Purpose:** Negotiate and execute data transfers via Dataspace Protocol.

**Technology:** Eclipse Dataspace Connector (Java/Spring)

**Responsibilities:**
- Asset cataloguing and discovery
- Contract negotiation via DSP
- Policy enforcement
- Transfer initiation and progress tracking

**Data Flow:**
```
Peer A EDC (DSP protocol)
    |
    POST /api/v1/dsp/contracts/negotiations/initiate
    (counterparty DID, asset ID, policy)
    |
    v
[Peer B EDC]
    |
    +-- query catalogue for asset
    +-- validate policy
    +-- accept/reject contract
    |
    v
Peer A EDC (DSP protocol)
    { contract_agreement_id }
```

**Why not replace with copyparty?**
- copyparty is a file store; EDC is a dataspace connector
- EDC handles policy enforcement, contract negotiation, audit trails
- copyparty is the **data backend**; EDC is the **protocol layer**
- Production dataspaces (GAIA-X, CRED) require EDC or equivalent DSP implementation

**EDC in eitel-node:**
- eitel-node does NOT start EDC itself (Option B: external EDC or Option A: include caas/)
- Handshake service calls EDC management API to register peers, query catalogue
- Peer DSP URLs are exchanged in handshake response
- DSP negotiation happens directly EDC-to-EDC after handshake

### Layer 3: copyparty (Data Backend)

**Purpose:** Provide P2P file storage for EDC to transfer.

**Technology:** copyparty (Python, WebRTC)

**Responsibilities:**
- Store uploaded files
- Serve files to peers via P2P WebRTC (LAN)
- Provide file browser API (gated by handshake session tokens)

**Data Flow:**
```
Peer A copyparty (WebRTC P2P)
    |
    file: document.pdf
    (WebRTC direct connection on LAN)
    |
    v
[Peer B copyparty]
    |
    +-- receive bytes
    +-- store to disk
    |
    v
Peer B copyparty (WebRTC P2P)
    { receipt, hash }
```

**Why copyparty?**
- Simple, lightweight, no central server required
- WebRTC P2P works on LAN without port forwarding
- Can be replaced with any backend (NFS, S3, etc.) by configuring EDC data plane
- PoC focuses on identity + protocol; storage backend is pluggable

**Why WebRTC P2P?**
- LAN scenario: two nodes on UC3M network, no NAT
- No central intermediary required
- Production requires STUN/TURN for internet traversal (future work)

---

## Relationship to caas/

### What is caas/?

Mario's `caas/` (Connector-as-a-Service) is a **multi-tenant EDC provisioning system**:
- Tenants request EDC instances via web UI or API
- CaaS generates docker-compose configs per tenant
- CaaS deploys and manages a pool of EDC runtimes
- Each tenant gets isolated EDC, database, UI

### How eitel-node differs

| Aspect | caas/ | eitel-node |
|--------|-------|-----------|
| **Purpose** | Multi-tenant provisioning | Single-node federation |
| **Tenants** | Multiple organizations | One organization |
| **Identity** | Delegated to (future) IAM | Peer-to-peer VC handshake |
| **Use case** | "EITEL as intermediary" | "Direct peer-to-peer" |
| **EDC role** | One EDC per tenant | Peer EDCs negotiate directly |

### Complementary, not Replacement

- **caas/ is for provisioning**: "We need an EDC for our organization"
- **eitel-node is for participation**: "We want to exchange data with peers directly"

**Integration path:**
```
Organization A (uses caas/)
    |
    EDC instance (managed by CaaS)
    |
    +-- runs eitel-node handshake service alongside EDC
    +-- uses same EDC instance for DSP negotiation
    |
    ↔ (DSP direct peer-to-peer)
    |
Organization B (runs eitel-node standalone)
    |
    EDC instance (self-hosted or via caas/)
    |
    +-- runs eitel-node handshake service
```

### Code Reuse

- eitel-node **does not** modify or fork caas/
- eitel-node **does not** duplicate EDC configuration
- eitel-node **does** reference caas/ via docker-compose `include:` directive (Option A) or external EDC URL (Option B)
- All files are in `eitel-node/` directory only

---

## Identity: did:key → did:web Migration Path

### PoC: did:key (No Domain Required)

**Format:** `did:key:z6Mk...` (multibase Ed25519)

**Advantages:**
- No TLS certificate required
- No DNS setup required
- Can run on LAN without public domain
- Ideal for PoC and development

**Implementation:**
```python
# Generate Ed25519 keypair
private_key = Ed25519PrivateKey.generate()
public_key = private_key.public_key()

# Derive did:key from public key bytes
# did:key:z6Mk...
```

**Limitations:**
- Key rotation requires changing the DID (breaks existing partnerships)
- No institutional binding (anyone can claim the DID)
- No way to prove DID ownership without prior relationship

### Production: did:web (Domain Binding)

**Format:** `did:web:uc3m.es:did%3Aeid%3Aconnector`

**Advantages:**
- Binds identity to institution's domain
- Key rotation via DID document update
- Third parties can verify ownership (public DID document)
- Aligns with GAIA-X Trust Anchors

**Implementation Path:**
```
1. Obtain TLS certificate for institution domain (e.g., did.uc3m.es)
2. Publish DID document at:
   https://uc3m.es/.well-known/did.json
3. In VC, issuer becomes `did:web:uc3m.es` instead of `did:key:...`
4. Peer verifies:
   - Fetch https://uc3m.es/.well-known/did.json
   - Verify VC signature against public key in DID document
5. Key rotation: update DID document, old signatures remain valid
```

**Coordinator Key Handling:**
```python
# PoC: static PEM file (did:key)
coordinator_pubkey_pem = Path("/keys/coordinator_pubkey.pem").read_text()

# Production: resolve from DID document
did_document = dereference_did("did:web:coordinator.es")
coordinator_pubkey = did_document["verificationMethod"][0]["publicKeyPem"]
```

**Timeline:**
- **Phase 1 (PoC):** did:key, static coordinator key
- **Phase 2 (Pre-production):** did:web, static coordinator key (institution domain + TLS)
- **Phase 3 (Production):** did:web, dynamic coordinator key (DID document resolution)

---

## Threat Model & Security Scope

### In Scope (PoC)

✅ **Institutional identity verification**: EITEL VC signature validation ensures peer is a known participant
✅ **Session token management**: Short-lived JWTs prevent token reuse
✅ **GAIA-X VP best-effort**: Informational; warns if peer lacks GX alignment (doesn't block)
✅ **Peer registry**: Tracks successful handshakes for audit

### Out of Scope (Future Work)

❌ **TLS encryption**: Handshake service assumed behind reverse proxy with TLS termination
❌ **Token revocation**: No revocation list; short TTL (1 hour) is mitigation
❌ **Rate limiting**: Applied at reverse proxy layer, not in service
❌ **NAT traversal**: STUN/TURN for internet P2P (LAN PoC only)
❌ **Mutual TLS for DSP**: EDC-to-EDC communication assumed trusted on LAN
❌ **Audit logging**: Handshake events logged; persistence is future work

### Known Limitations

- **Coordinator key pinning**: If coordinator key is compromised, handshake fails securely (reject all VCs). Key rotation requires redeployment.
- **GX VP chain incomplete**: `compliance.eiteldata.eu` TLS chain mismatch prevents full GX verification. Stub checks structure only.
- **Session token bearer**: No nonce; long-lived tokens in URL considered anti-pattern (tokens in `Authorization` header only).

---

## Deployment Variants

### Development (docker-compose on laptop)

```bash
cd eitel-node
export EITEL_NODE_SESSION_TOKEN_SECRET=$(openssl rand -base64 32)
docker compose up
# Runs handshake + copyparty + (optional) caas/
```

**Network:** Internal bridge, localhost access only

### PoC on UC3M LAN (two machines)

```bash
# Machine A
cd eitel-node
docker compose up

# Machine B
cd eitel-node
docker compose up
```

**Network:** Both on same LAN (192.168.x.x), direct peer calls

**Limitations:**
- No internet routing (LAN only)
- Both must have coordinator key pre-loaded
- Firewall must allow port 8080 (handshake) + 3923 (copyparty)

### Production (AWS EC2 + ALB)

```bash
# On EC2 instance
git clone https://github.com/.../EITELConnector.git
cd eitel-node
# Place coordinator key in keys/
# Configure .env with production secrets
docker compose up -d

# Install systemd service for auto-restart
sudo cp deploy/systemd/eitel-connector.service /etc/systemd/system/
sudo systemctl enable --now eitel-connector
```

**Network:**
- ALB (Application Load Balancer) on port 443 (HTTPS)
- TLS termination at ALB
- Handshake service on port 8080 (internal)
- EDC on internal port 11003 (DSP)
- copyparty on port 3923 (internal, gated by handshake tokens)

**TODO (Production):**
- Configure NAT traversal (STUN/TURN) for cross-site P2P
- Implement EDC data plane for actual transfer execution
- Set up persistent PostgreSQL for EDC (not SQLite)
- Configure audit logging and monitoring
- Implement token revocation (if needed beyond TTL)

---

## Data Persistence

### Volumes

| Volume | Purpose | Persistence |
|--------|---------|-------------|
| `node_identity` | Stores did:key + keypair (node.json) | Across restarts |
| `copyparty_data` | Uploaded/shared files | Across restarts |
| (EDC PostgreSQL) | Contracts, transfers, assets | Across restarts |

### Backup Strategy

```bash
# Backup node identity
docker run --rm -v eitel-node_node_identity:/data \
  -v /backup:/backup alpine tar czf /backup/identity.tar.gz -C /data .

# Backup copyparty data
docker run --rm -v eitel-node_copyparty_data:/data \
  -v /backup:/backup alpine tar czf /backup/files.tar.gz -C /data .
```

**Critical:** Node identity (`node.json`) is the DID anchor. Losing it means losing peer relationships (would need to re-handshake with new DID).

---

## Future Enhancements

### Near-term (Q3 2025)

- [ ] EDC data plane integration (actual transfer execution, not just initiation)
- [ ] Persistent peer registry (database instead of in-memory)
- [ ] Real-time WebSocket notifications (transfer progress, policy violations)
- [ ] Multi-language VC support (currently assumes EITEL VC format)

### Medium-term (2026)

- [ ] did:web migration (institution domain binding + TLS)
- [ ] STUN/TURN for internet P2P (not just LAN)
- [ ] Multi-signature VPs (multiple institutions co-sign credentials)
- [ ] HTTPS for handshake service (production deployment)

### Long-term (2027+)

- [ ] Full GAIA-X compliance chain (resolve TLS chain issue at compliance provider)
- [ ] Decentralized trust registry (replace static coordinator key)
- [ ] Policy-driven data access (EDC policy negotiation for fine-grained control)
- [ ] Inter-dataspace federation (EITEL ↔ CRED ↔ other dataspaces)

---

## References

- **PROTOCOL.md** — Formal handshake message schemas and flow
- **README.md** — Setup guide and quick-start scenarios
- **docs/GAIA-X** — GAIA-X Trust Framework alignment (future)
- **Eclipse EDC** — https://eclipse-edc.github.io/
- **Dataspace Protocol (DSP)** — https://github.com/GAIA-X-COMMUNITY/data-space-protocol/
- **did:key** — https://w3c-ccg.github.io/did-method-key/
- **did:web** — https://w3c-ccg.github.io/did-method-web/

---

## Governance & Maintenance

**Branch:** `feature/eitel-node-poc` (this PoC)

**PR Strategy:** This will be opened as PR `jolazaro-UC3M/EITELConnector` → `mariwogr/EITELConnector`.

**Maintenance:** eitel-node is complementary to caas/. Both can coexist in the same repo. Merging does not require changes to caas/ or root docker-compose files.

---

## Contact & Contribution

For questions or contributions to the PoC:
- jolazaro@uc3m.es
- Feature branch discussions: GitHub Issues on this PR

For production roadmap: coordinate with Mario (mariwogr) and UC3M/CRED dataspace team.
