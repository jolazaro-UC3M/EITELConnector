# EITEL Dual-VC Handshake Protocol

## Overview

The EITEL dual-VC handshake is a mutual trust establishment mechanism between two EITEL participant nodes before they proceed to negotiate and execute data transfers via EDC's Dataspace Protocol (DSP). It consists of two components:

1. **EITEL Verifiable Credential (VC)** — issued by EITELCoordinator, proves institutional participation and DID binding
2. **GAIA-X Verifiable Presentation (VP)** — optional, proves alignment with GAIA-X principles (best-effort validation)

After mutual VC validation, peers issue session tokens that gate access to local APIs (catalogue proxy, file browser). Subsequent DSP negotiation happens directly between EDC instances without further involvement of the handshake service.

---

## Architecture

### Three-Layer Stack

```
┌─────────────────────────────────────────────────────┐
│ Layer 1: Handshake Service (FastAPI)                │
│ ├─ EITEL VC validation (Ed25519 signature)          │
│ ├─ GAIA-X VP check (best-effort)                    │
│ └─ Session token issuance (JWT)                     │
└─────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────┐
│ Layer 2: EDC (Eclipse Dataspace Connector)          │
│ ├─ Asset cataloguing                                │
│ ├─ Contract negotiation (DSP protocol)              │
│ └─ Transfer initiation & enforcement                │
└─────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────┐
│ Layer 3: copyparty (Data Backend)                   │
│ ├─ P2P file store (WebRTC)                          │
│ └─ File serving                                     │
└─────────────────────────────────────────────────────┘
```

---

## Handshake Flow

### Step 1: Initiation (Node A → Node B)

Node A sends an HTTP POST to Node B's handshake service:

```
POST /handshake/initiate
Host: nodeB:8080
Content-Type: application/json

{
  "did": "did:key:z6Mki...NodeA",
  "eitel_vc": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiableCredential"],
    "issuer": "did:key:z6Mku...Coordinator",
    "issuanceDate": "2025-04-15T10:00:00Z",
    "credentialSubject": {
      "id": "did:key:z6Mki...NodeA",
      "institution": "UC3M",
      "role": "participant",
      "expirationDate": "2026-04-15T10:00:00Z"
    },
    "proof": {
      "type": "JwtProof",
      "jwt": "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkaWQ6a2V5Ono2TWt1IiwiY3JlZGVudGlhbFN1YmplY3QiOnsiid...base64_jws_compact_serialization..."}
    }
  },
  "gaia_x_vp": {
    "@context": ["https://www.w3.org/2018/credentials/v1", "https://gaia-x.eu/"],
    "type": ["VerifiablePresentation"],
    "holder": "did:key:z6Mki...NodeA",
    "verifiableCredential": [
      {
        "type": ["VerifiableCredential", "GXComplianceCredential"],
        "credentialSubject": { "id": "did:key:z6Mki...NodeA" },
        "proof": { "type": "Ed25519Signature2020", "signatureValue": "..." }
      }
    ],
    "proof": {
      "type": "Ed25519Signature2020",
      "signatureValue": "..."
    }
  }
}
```

**Fields:**
- `did`: Node A's `did:key` identifier (multibase Ed25519 DID)
- `eitel_vc`: JSON-LD Verifiable Credential issued by EITELCoordinator
- `gaia_x_vp`: GAIA-X Verifiable Presentation (optional; absence permitted with warning)

---

### Step 2: EITEL VC Validation (Node B)

Node B validates Node A's EITEL VC:

1. **Structural check:**
   - Verify `@context` includes `https://www.w3.org/2018/credentials/v1`
   - Verify `type` includes `"VerifiableCredential"`
   - Verify `issuer` is the configured EITELCoordinator DID
   - Verify `proof.type == "JwtProof"` and `proof.jwt` is present

2. **Signature verification:**
   - Extract `proof.jwt` (JWS compact serialization: header.payload.signature)
   - Load the coordinator's Ed25519 public key from static config (`coordinator_pubkey.jwk`)
   - Verify JWS signature using EdDSA algorithm against the public key
   - Decode the JWS payload to extract the signed VC body
   - **On failure:** Return 401 Unauthorized, detail: "JWS signature verification failed"

3. **DID binding check:**
   - Verify `credentialSubject.id == req.did` (from decoded JWT payload)
   - **On failure:** Return 400 Bad Request, detail: "DID mismatch"

**On all checks passing:** Proceed to Step 3.

---

### Step 3: GAIA-X VP Check (Node B, Best-Effort)

If `gaia_x_vp` is present, Node B attempts JSON-LD structural validation:

1. **Structural check:**
   - Verify `@context` includes `"https://gaia-x.eu/"` or similar GX namespace
   - Verify `type` includes `"VerifiablePresentation"`
   - Verify `holder == req.did`

2. **Credential check (best-effort):**
   - Iterate over `verifiableCredential` array
   - For each credential: attempt to validate structure (optional signature verification)
   - **On structure error:** Log warning, continue (do not block)
   - **On signature verification error:** Log warning, continue (do not block)

3. **Outcome:**
   - If all credentials valid: set `gx_vp_status = "valid"`
   - If any validation failed: set `gx_vp_status = "invalid_<reason>"`
   - If absent: set `gx_vp_status = "absent"`

**Critical:** VP validation failures do NOT block the handshake. This reflects the known PoC limitation: Carla confirmed the full GAIA-X compliance chain is unreachable at `compliance.eiteldata.eu` due to TLS chain mismatch (GitHub Pages domain). UC3M and Fuenlabrada VPs are used as "near-production" artefacts.

**On VP present but invalid:** Log warning with reason, surface in `/status` endpoint, continue to token issuance.

---

### Step 4: Session Token Issuance (Node B)

On successful EITEL VC validation (regardless of GX VP status), Node B issues a JWT session token:

```json
{
  "sub": "did:key:z6Mki...NodeA",
  "aud": "handshake",
  "exp": 1713181200,
  "iat": 1713177600,
  "iss": "did:key:z6Mku...NodeB"
}
```

**Fields:**
- `sub`: Peer node's DID (subject)
- `aud`: Audience (`"handshake"` — gates access to handshake service APIs)
- `exp`: Expiration timestamp (now + TTL, typically 3600s)
- `iat`: Issuance timestamp (now)
- `iss`: Node B's DID (issuer — optional but recommended)

**Signing:** HMAC-SHA256 with the handshake service's signing secret (configured via env var, not derived from Ed25519 keypair)

---

### Step 5: Handshake Response (Node B → Node A)

Node B returns HTTP 200 OK:

```json
{
  "status": "ok",
  "session_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "node_did": "did:key:z6Mku...NodeB",
  "peer_did": "did:key:z6Mki...NodeA",
  "gx_vp_status": "valid|invalid_<reason>|absent",
  "dsp_endpoint": "http://nodeB:11003/api/v1/dsp"
}
```

**Fields:**
- `status`: `"ok"` on success (no error field)
- `session_token`: JWT token for Node A to use in subsequent calls
- `node_did`: Node B's DID
- `peer_did`: Node A's DID (echo of request)
- `gx_vp_status`: Status of GX VP validation (informational; never blocks)
- `dsp_endpoint`: EDC DSP endpoint URL for Node A to use in negotiation (internal to Node B's network)

---

## Error Responses

### VC Validation Failures

**Invalid signature:**
```json
HTTP 401 Unauthorized

{
  "detail": "VC signature invalid"
}
```

**VC expired:**
```json
HTTP 401 Unauthorized

{
  "detail": "VC expired (expiration: 2025-04-15, now: 2025-04-16)"
}
```

**DID mismatch:**
```json
HTTP 400 Bad Request

{
  "detail": "DID mismatch (credential: did:key:..., request: did:key:...)"
}
```

**Issuer not recognized:**
```json
HTTP 401 Unauthorized

{
  "detail": "VC issuer not recognized (issuer: did:key:..., expected: <configured_coordinator_did>)"
}
```

**Malformed VC:**
```json
HTTP 400 Bad Request

{
  "detail": "Malformed VC: missing field credentialSubject.expirationDate"
}
```

---

## Session Token Usage

### HTTP Bearer Token

Peer uses the session token in subsequent HTTP calls to the handshake service:

```
GET /status
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The handshake service validates the token's signature and expiration. On failure:

```json
HTTP 401 Unauthorized

{
  "detail": "Invalid or expired session token"
}
```

---

### WebSocket Upgrade Ticket

For WebSocket connections (future: real-time updates), the peer exchanges the HTTP bearer token for a single-use 30-second upgrade ticket:

```
GET /handshake/ticket
Authorization: Bearer <session_token>
```

Response:
```json
HTTP 200 OK

{
  "ticket": "one_time_ticket_xyz",
  "expires_in": 30
}
```

The peer then connects to WebSocket with:
```
WS /ws?ticket=one_time_ticket_xyz
```

The handshake service validates and invalidates the ticket on first use (one-time only). Subsequent WebSocket frames are authenticated via the session token (sent in first frame of auth subprotocol).

---

## Message Schemas (Formal)

### InitiateHandshakeRequest

```typescript
interface InitiateHandshakeRequest {
  did: string;                    // Peer's multibase did:key
  eitel_vc: VerifiableCredential; // EITEL VC (JSON-LD)
  gaia_x_vp?: VerifiablePresentation; // Optional GAIA-X VP
}

interface VerifiableCredential {
  "@context": string[];
  type: string[];
  issuer: string;                 // Coordinator DID
  issuanceDate: string;           // RFC3339
  credentialSubject: {
    id: string;                   // Peer DID
    institution: string;
    role: string;
    expirationDate: string;       // RFC3339
    [key: string]: any;
  };
  proof: {
    type: string;                 // "Ed25519Signature2020"
    created: string;              // RFC3339
    verificationMethod: string;   // Coordinator's verification method
    signatureValue: string;       // Base64-encoded Ed25519 signature
  };
}

interface VerifiablePresentation {
  "@context": string[];
  type: string[];
  holder: string;                 // Peer DID
  verifiableCredential: VerifiableCredential[];
  proof: {
    type: string;
    signatureValue: string;
  };
}
```

### InitiateHandshakeResponse

```typescript
interface InitiateHandshakeResponse {
  status: "ok";
  session_token: string;          // JWT (HS256)
  node_did: string;               // Responder's did:key
  peer_did: string;               // Peer's did:key (echo)
  gx_vp_status: "valid" | "invalid_<reason>" | "absent";
  dsp_endpoint: string;           // EDC DSP URL
}

interface InitiateHandshakeError {
  detail: string;                 // Human-readable error
}
```

### SessionToken (JWT)

```typescript
interface SessionTokenPayload {
  sub: string;                    // Peer DID
  aud: "handshake";
  exp: number;                    // Unix timestamp
  iat: number;                    // Unix timestamp
  iss?: string;                   // Node's own DID (optional)
}
```

---

## Coordinator Public Key Loading

The handshake service loads the EITELCoordinator's Ed25519 public key at startup from a static JWK file (environment variable `EITEL_NODE_COORDINATOR_PUBKEY_JWK_PATH`).

**Example coordinator_pubkey.jwk (Ed25519):**
```json
{
  "crv": "Ed25519",
  "kid": "eitel-coordinator-poc-1",
  "kty": "OKP",
  "x": "q2EH8Q2KuRKY-xoQAAHQhx77n4LSdyKGbrmWGtPNxaE",
  "use": "sig"
}
```

**Rationale:** Static loading mirrors production TLS certificate handling. No live DID resolution. Coordinator key rotation requires service restart (acceptable for PoC; production would use DID document resolution).

---

## Future Evolution

### Production: did:web

Replace `did:key` with `did:web` bound to institution domain:
```
did:web:uc3m.es:did%3Aeid%3Aconnector
```

Requires TLS certificate for domain and DID document publication. Migration path: extract institution domain from VC issuer, resolve DID document, verify key binding.

### Production: Real-time notifications

Upgrade to WebSocket for real-time handshake status, transfer progress, policy violation alerts. Use ticket-based upgrade (as per Section "WebSocket Upgrade Ticket") to avoid long-lived bearer tokens in URL.

### Future: Multi-signature VPs

Support chainable VPs where multiple institutions cosign credentials (e.g., UC3M + CRED + Fuenlabrada). Current PoC: single VP from holder.

---

## Security Considerations

### Out of Scope (PoC)

- **TLS for handshake service:** Assumed behind reverse proxy with TLS termination (production)
- **Token revocation:** Session tokens are short-lived (3600s default); no revocation list
- **Replay protection:** Single-use tickets prevent replay; session tokens are bearer-token (no nonce)
- **Rate limiting:** No built-in rate limiting (to be applied at reverse proxy layer)
- **NAT traversal for P2P:** copyparty WebRTC P2P works on LAN; STUN/TURN for internet routing is future

### In Scope (PoC)

- **Signature verification:** Ed25519 cryptographic validation mandatory for VC
- **Expiration enforcement:** VC and session token expiration checked on every request
- **DID binding:** Peer DID must match VC credentialSubject.id
- **Coordinator key pinning:** Static public key, no MITM via compromised DID resolution
- **GX VP best-effort:** Missing VP logged and surfaced, never blocks (known limitation)

---

## Testing & Validation

### Unit Tests

1. **VC signature verification:** Valid signature passes; invalid signature fails
2. **VC expiration:** Expired VC rejected; future-dated VC accepted
3. **DID binding:** Mismatched DID rejected
4. **Token issuance:** Valid VC → session token issued with correct claims
5. **Token validation:** Valid token passes; expired/invalid token rejected
6. **GX VP parsing:** Malformed VP logged as warning; valid VP marked "valid"

### Integration Tests

1. **Dual-node handshake:** Node A → Node B with valid VC → session token returned
2. **Dual-node with invalid VC:** Node A → Node B with invalid signature → 401 returned
3. **Token usage:** Node A uses token to call `/status` on Node B → success; stale token → 401

### PoC Scenario (Manual)

1. Start Node A, Node B on same LAN
2. On Node A: Call Node B's `/handshake/initiate` with PoC EITEL VC (signed by UC3M coordinator)
3. Node B validates signature, returns session token
4. Node A uses token to query Node B's catalogue and copyparty file browser
5. Both nodes' EDC instances initiate DSP negotiation directly (peer DSP URLs exchanged in handshake response)
6. Transfer executes via copyparty P2P WebRTC on LAN (no EITEL intermediary)
