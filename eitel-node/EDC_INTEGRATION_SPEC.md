# EDC Integration Specification

## Overview

This document specifies the requirements for integrating the EITEL Node Handshake Service with the Eclipse Dataspace Connector (EDC) via the Management API and DSP protocol.

**Audience**: EDC Connector Operators (e.g., Mario's connector team)

**Purpose**: Define the API contracts and data formats required for the EITEL PoC to work with EDC instances.

---

## 1. Handshake Service Response Extension

### 1.1 `/handshake/initiate` Response Format

The EITEL Node's handshake endpoint now returns an additional field: `dsp_endpoint`. This field must be present in all handshake responses.

**Response Model**:
```json
{
  "status": "ok",
  "session_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "node_did": "did:key:z6Mkhabn...",
  "peer_did": "did:key:z6Mkhabn...",
  "gx_vp_status": "absent",
  "dsp_endpoint": "http://producer-edc:11003/api/v1/dsp"
}
```

**Field Description**:
- `dsp_endpoint` (string, required): URL to the EDC's DSP protocol endpoint. Consumer nodes use this to initiate contract negotiations with the producer's EDC connector.
- Format: `http://<host>:<port>/api/v1/dsp` or `https://<host>:<port>/api/v1/dsp`

### 1.2 Configuration in EITEL Node

The `dsp_endpoint` is configurable via environment variable in the EITEL Node:

```bash
EITEL_NODE_EDC_DSP_ENDPOINT=http://your-edc:11003/api/v1/dsp
```

For production deployments, this should be set to a publicly routable URL that consumer nodes can reach to initiate DSP negotiations.

---

## 2. Asset Registration Format

### 2.1 Asset Creation

Assets must be pre-registered in EDC before consumers can negotiate for them. The EITEL Node consumer queries the producer's catalogue via EDC's DSP protocol and discovers assets.

**EDC Asset Registration API**: `POST /management/v3/assets` (or `/v3/assets` relative to management base URL)

**Payload Format**:
```json
{
  "@context": "https://w3id.org/edc/v0.0.1/ns/",
  "id": "test-dataset.json",
  "properties": {
    "https://w3id.org/edc/v0.0.1/ns/name": "Test Dataset",
    "https://w3id.org/edc/v0.0.1/ns/description": "Dataset for EITEL PoC"
  },
  "dataAddress": {
    "@type": "HttpData",
    "baseUrl": "http://copyparty:3923/files",
    "type": "HttpData"
  }
}
```

**Field Requirements**:
- `id`: Asset ID must match the filename (for PoC: `test-dataset.json`)
- `dataAddress.baseUrl`: HTTP endpoint where the file is accessible. For EITEL nodes using copyparty, this is typically `http://copyparty:3923/files`
- `properties`: Standard EDC asset metadata (name, description, etc.)

### 2.2 Default Policy

For PoC testing, assets should have a permissive default policy allowing any consumer to negotiate:

```json
{
  "@context": "https://w3id.org/edc/v0.0.1/ns/",
  "id": "default-policy",
  "policy": {
    "@type": "set",
    "audited": false,
    "permission": [
      {
        "@type": "Permission",
        "target": "asset-id",
        "action": {
          "@type": "Action",
          "type": "USE"
        },
        "constraints": []
      }
    ]
  }
}
```

Or via EDC's simplified policy format:
```bash
curl -X POST http://edc:11002/management/v3/policydefinitions \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "default-allow",
    "@context": "https://w3id.org/edc/v0.0.1/ns/",
    "policy": {
      "@type": "set",
      "permission": [{
        "action": { "type": "USE" },
        "target": "*"
      }]
    }
  }'
```

---

## 3. EDC Management API Requirements

### 3.1 Required Endpoints

The EITEL Node expects the following EDC Management API endpoints to be available under the management context path.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v3/catalog/request` | POST | Query peer catalogues via DSP |
| `/v3/contractnegotiations/initiate` | POST | Initiate contract negotiation |
| `/v3/contractnegotiations/{id}` | GET | Poll negotiation state |
| `/v3/transferprocesses` | POST | Start data transfer |
| `/v3/transferprocesses/{id}` | GET | Poll transfer state |
| `/v3/assets` | POST | Register assets (for PoC setup) |

### 3.2 Authentication

All management API calls require x-api-key authentication.
When `EITEL_NODE_EDC_MANAGEMENT_URL` already includes `/management` (recommended), keep endpoint calls as `/v3/*`.

```
Headers: {
  "x-api-key": "<your-edc-api-key>",
  "Content-Type": "application/json"
}
```

Configuration in EITEL Node:
```bash
EITEL_NODE_EDC_API_KEY=your-secure-api-key
EITEL_NODE_EDC_MANAGEMENT_URL=http://your-edc:11002/management
```

### 3.3 Catalogue Request Format

**Request**: `POST /management/v3/catalog/request`

```json
{
  "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
  "@type": "CatalogRequest",
  "counterPartyAddress": "http://peer-edc:11003/api/v1/dsp",
  "protocol": "dataspace-protocol-http"
}
```

**Response** (example):
```json
{
  "data": {
    "asset": [
      {
        "id": "test-dataset.json",
        "properties": {
          "name": "Test Dataset"
        }
      }
    ]
  }
}
```

### 3.4 Contract Negotiation Flow

**Step 1**: Initiate negotiation

**Request**: `POST /management/v3/contractnegotiations/initiate`

```json
{
  "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
  "@type": "ContractRequest",
  "counterPartyAddress": "http://peer-edc:11003/api/v1/dsp",
  "protocol": "dataspace-protocol-http",
  "policy": {
    "@type": "Offer",
    "@id": "test-dataset.json",
    "assigner": "did:key:peer-did",
    "target": "test-dataset.json"
  }
}
```

**Response**:
```json
{
  "id": "negotiation-123-abc",
  "state": "REQUESTED"
}
```

**Step 2**: Poll until finalized

**Request**: `GET /management/v3/contractnegotiations/negotiation-123-abc`

**Response** (FINALIZED state):
```json
{
  "id": "negotiation-123-abc",
  "state": "FINALIZED",
  "contractAgreementId": "contract-agreement-xyz"
}
```

Possible states: `REQUESTED`, `OFFERED`, `ACCEPTED`, `AGREED`, `FINALIZED`, `TERMINATED`, `FAILED`

### 3.5 Transfer Request Flow

**Step 1**: Start transfer

**Request**: `POST /management/v3/transferprocesses`

```json
{
  "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
  "@type": "TransferRequest",
  "contractId": "contract-agreement-xyz",
  "counterPartyAddress": "http://peer-edc:11003/api/v1/dsp",
  "assetId": "test-dataset.json",
  "protocol": "dataspace-protocol-http",
  "dataDestination": {
    "@type": "HttpData",
    "baseUrl": "http://consumer-copyparty:3923"
  }
}
```

**Response**:
```json
{
  "id": "transfer-process-001",
  "state": "STARTED"
}
```

**Step 2**: Poll until completed

**Request**: `GET /management/v3/transferprocesses/transfer-process-001`

**Response** (COMPLETED state):
```json
{
  "id": "transfer-process-001",
  "state": "COMPLETED"
}
```

Possible states: `STARTED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `TERMINATED`, `ERROR`

---

## 4. DID Evolution & Configuration

### 4.1 DID Scheme Transition

The EITEL nodes are transitioning from `did:key` (test) to `did:web` (production) DIDs:

- **Test/PoC**: `did:key:z6MkhaXgBZDvotDkL5257faWxcqLsxContractId...`
- **Production (Fuenlabrada)**: `did:web:compliance.eiteldata.eu:fuenlabrada`
- **Production (Gaia-X Compliant)**: `did:web:compliance.eiteldata.eu:<participant-id>`

### 4.2 Implications for EDC

The EITEL Node's handshake endpoint returns the node's current DID in the `node_did` field. EDC operators must **not hardcode** node DIDs. Instead:

1. Accept DIDs dynamically from the handshake response
2. Use returned DIDs in contract offer payloads
3. Support DID format transitions (both `did:key` and `did:web` in policies)

### 4.3 Example DID in Policy

```json
{
  "policy": {
    "@type": "Offer",
    "@id": "offer-123",
    "assigner": "did:web:compliance.eiteldata.eu:fuenlabrada",
    "target": "test-dataset.json"
  }
}
```

---

## 5. EDC Version Compatibility

**Minimum EDC Version**: **9.0** or later

The EITEL Node expects:
- Management API endpoints at `/management/v3/*` (or `/v3/*` relative to configured management base URL)
- DSP protocol support
- Ed25519 credential verification (for cross-node validation)

**Tested Versions**:
- EDC 9.0.x
- EDC 10.0.x (recommended)

---

## 6. Data Destination Format

When initiating transfers, the consumer specifies where data should be sent via `dataDestination`:

```json
{
  "@type": "HttpData",
  "baseUrl": "http://consumer-node-copyparty:3923"
}
```

EDC's HTTP data plane will `PUT` the file to:
```
http://consumer-node-copyparty:3923/<asset-id>
```

The consumer's copyparty must be configured to accept file uploads. Verify:
```bash
curl -X PUT http://copyparty:3923/upload \
  -H "Authorization: Bearer <copyparty-password>" \
  --data-binary @file.json
```

---

## 7. Testing Checklist for EDC Operators

Before running the EITEL PoC with your EDC instance:

- [ ] EDC version >= 9.0
- [ ] Management API accessible at `/management/v3/` endpoints
- [ ] DSP endpoint exposed and reachable: `/api/v1/dsp`
- [ ] API key authentication configured
- [ ] At least one asset pre-registered with HTTP data address
- [ ] Default policy created for test assets
- [ ] EDC can reach consumer's copyparty endpoint (for HttpData)
- [ ] Negotiation states transition correctly (tested via `GET /management/v3/contractnegotiations/{id}`)
- [ ] Transfer processes reach `COMPLETED` state within 60 seconds

---

## 8. Troubleshooting

### Issue: "Catalogue query failed: 500"

**Cause**: DSP endpoint not reachable or catalogue empty

**Solution**:
- Verify DSP endpoint URL in `EITEL_NODE_EDC_DSP_ENDPOINT`
- Check EDC logs for DSP errors
- Ensure `POST /management/v3/catalog/request` endpoint is functional

### Issue: "Asset 'test-dataset.json' not found in peer catalogue"

**Cause**: Asset not registered or not published to DSP

**Solution**:
- Register asset: `POST /management/v3/assets` (see section 2.1)
- Verify asset appears in catalogue: `POST /management/v3/catalog/request` from another EDC
- Check asset has valid `dataAddress`

### Issue: "Negotiation failed with state: FAILED"

**Cause**: Policy mismatch or permission denied

**Solution**:
- Use default-allow policy for PoC
- Verify `assigner` DID in offer matches producer's node DID
- Check EDC logs for policy evaluation errors

### Issue: "Transfer did not complete within 60 seconds"

**Cause**: Consumer copyparty unreachable or transfer blocked

**Solution**:
- Verify consumer copyparty endpoint is routable from producer EDC
- Check consumer node's copyparty is running and accepting uploads
- Review EDC data plane logs for HTTP errors

---

## 9. References

- EDC Documentation: https://eclipse-edc.github.io/
- DSP Protocol Spec: https://docs.internationaldataspaces.org/
- EITEL Node README: `./README.md`
- Integration Tests: `./handshake/tests/test_integration.py`

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-04-22 | 1.0 | Initial spec for PoC integration |
| | | Documents `/management/v3/` management API |
| | | Asset registration format |
| | | DID evolution (did:key → did:web) |
