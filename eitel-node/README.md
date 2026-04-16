# EITEL Node

Nodo participante autohospedable para EITEL Distribuido (Fase Estrella). Implementa la puerta de confianza dual-VC que valida credenciales de pares antes de negociar intercambios de datos directos P2P sin intermediarios.

## Inicio rápido

**Requisitos:** Docker & Docker Compose, o Python 3.13+ con [uv](https://docs.astral.sh/uv/guides/installation/)

### Docker (recomendado)

```bash
cd eitel-node
docker compose up -d
```

El servicio de handshake será accesible en `http://localhost:8080` • Documentación en `http://localhost:8080/docs`

### Desarrollo local (Python)

```bash
cd eitel-node/handshake
uv venv && source .venv/bin/activate  # Unix/macOS
uv venv && .venv\Scripts\activate     # Windows
uv sync
```

**Configurar variables de entorno:**

```bash
cp .env.example .env
# Editar .env con rutas locales y secretos
```

**Ejecutar servicio:**

```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8080
```

API disponible en `http://localhost:8080` • Documentación en `http://localhost:8080/docs`

## Configuración

Las variables de entorno (prefijo `EITEL_NODE_`) se cargan desde `.env`:

```bash
# En eitel-node/handshake/.env
EITEL_NODE_COORDINATOR_PUBKEY_JWK_PATH=/keys/coordinator_pubkey.jwk
EITEL_NODE_EDC_MANAGEMENT_URL=http://edc-control:8182
EITEL_NODE_NODE_IDENTITY_DIR=/identity
EITEL_NODE_SESSION_TOKEN_TTL=3600
EITEL_NODE_SESSION_TOKEN_SECRET=cambiar-a-secreto-fuerte-en-produccion
```

Ver [`.env.example`](.env.example) para opciones completas.

**Clave pública del Coordinador:** Colocar archivo JWK en `eitel-node/keys/coordinator_pubkey.jwk` (obtenido de EITELCoordinator)

## Endpoints de la API

### `GET /health`

Estado del servicio.

```bash
curl http://localhost:8080/health
```

### `GET /status`

Información del nodo: DID, último handshake, peers registrados, estado VP de Gaia-X.

```bash
curl http://localhost:8080/status
```

Respuesta:
```json
{
  "node_did": "did:key:z6Mk...",
  "last_handshake": "2025-04-16T12:34:56Z",
  "gx_vp_status": "absent",
  "registered_peers": [
    {
      "did": "did:key:z6Mk...",
      "registered_at": "2025-04-16T12:00:00Z",
      "status": "active"
    }
  ]
}
```

### `POST /handshake/initiate`

Iniciar handshake dual-VC con otro nodo. Valida credencial EITEL y VP de Gaia-X (opcional), emite token de sesión.

```bash
curl -X POST http://localhost:8080/handshake/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "did": "did:key:z6Mk...",
    "eitel_vc": {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential"],
      "issuer": "did:key:z6Mk...Coordinator",
      "credentialSubject": {"id": "did:key:z6Mk..."},
      "proof": {"type": "JwtProof", "jwt": "eyJ..."}
    }
  }'
```

Respuesta (éxito):
```json
{
  "status": "ok",
  "session_token": "eyJ...",
  "node_did": "did:key:z6Mk...",
  "peer_did": "did:key:z6Mk...",
  "gx_vp_status": "absent",
  "dsp_endpoint": "http://localhost:11003/api/v1/dsp"
}
```

### `GET /handshake/ticket`

Intercambiar token de sesión por ticket de WebSocket de un solo uso (30s).

```bash
curl http://localhost:8080/handshake/ticket \
  -H "Authorization: Bearer eyJ..."
```

## Tests

```bash
cd eitel-node/handshake

uv run pytest tests/              # Todos los tests (45 total)
uv run pytest tests/ -v           # Verbose
uv run pytest tests/ --cov=core   # Con cobertura
```

Tests incluyen:
- **Unitarios (36):** Generación de identidad, validación de VC, tokens JWT, verificación VP
- **Integración (9):** Flujo completo de handshake, endpoints HTTP, registración de peers

## Estructura del proyecto

```
eitel-node/
├── README.md                 # Este archivo
├── .env.example              # Variables de entorno
├── docker-compose.yml        # Stack de tres capas
├── keys/
│   └── coordinator_pubkey.jwk    # Clave pública del Coordinador
├── handshake/
│   ├── main.py               # Aplicación FastAPI
│   ├── config.py             # Configuración desde entorno
│   ├── Dockerfile            # Imagen del servicio
│   ├── requirements.txt       # Dependencias Python
│   ├── core/
│   │   ├── identity.py       # Generación did:key + persistencia
│   │   ├── vc_verifier.py    # Validación VC con JWS Ed25519
│   │   ├── vp_checker.py     # Validación VP Gaia-X (best-effort)
│   │   ├── session.py        # JWT + tickets WebSocket
│   │   └── edc_client.py     # Proxy a EDC management API
│   ├── routers/
│   │   ├── handshake.py      # POST /handshake/initiate
│   │   └── status.py         # GET /status, GET /handshake/ticket
│   └── tests/
│       ├── test_identity.py        # Tests de identidad
│       ├── test_vc_verifier.py     # Tests de VC
│       ├── test_session_tokens.py  # Tests de JWT
│       ├── test_handshake_endpoint.py  # Tests de modelos
│       └── test_integration.py     # Tests de integración
└── docs/
    ├── PROTOCOL.md       # Especificación del protocolo
    └── ARCHITECTURE.md   # Arquitectura de tres capas
```

## Arquitectura

**Tres capas:**

1. **Handshake Service (Capa 1):** Valida credenciales EITEL mediante firmas Ed25519, verifica identidades de pares, emite tokens JWT para autenticación.

2. **EDC (Capa 2):** Eclipse Dataspace Connector ejecuta negociación DSP entre pares. El handshake service actúa como proxy de catálogo.

3. **copyparty (Capa 3):** Almacenamiento P2P descentralizado. WebRTC E2E para transferencias directas en LAN.

**Flujo de confianza:**

1. Nodo A envía VC firmado por Coordinador al Nodo B
2. Nodo B valida firma con clave pública del Coordinador (cacheada, offline)
3. Handshake genera token de sesión
4. Nodo A autentica en endpoints de Nodo B con el token
5. EDC negocia transferencias; copyparty ejecuta P2P

Después del handshake, el Coordinador no está en la ruta de datos.

## Tecnologías

- Python 3.13
- FastAPI + uvicorn
- cryptography (Ed25519)
- jwcrypto (JWS/JWT)
- pydantic-settings
- base58 (multibase encoding para did:key)
- pytest (45 tests unitarios + integración)

## Futuro

- [ ] **did:web:** Reemplazar did:key con dominio institucional (producción)
- [ ] **Cadena Gaia-X completa:** Resolver problema TLS en compliance.eiteldata.eu
- [ ] **Persistencia de peers:** Base de datos para historial de handshakes
- [ ] **NAT traversal:** STUN/TURN para sitios distribuidos (no LAN)
- [ ] **TLS/HTTPS:** Servicio detrás de reverse proxy con certificados
- [ ] **Negociación de políticas:** Soporte para contratos de acceso a datos
- [ ] **EDC data plane:** Ejecución de transferencias
- [ ] **Observabilidad:** Prometheus, Jaeger, logging estructurado

## Contexto

Parte de la arquitectura distribuida de EITEL Distribuido (Fase Estrella):
- **[EITELCoordinator](https://github.com/tu-org/EITELCoordinator):** Autoridad de confianza, emite VCs
- **[EITEL Node](https://github.com/tu-org/EITELConnector):** Participante autohospedable
- **[CaaS](https://github.com/tu-org/EITELConnector):** Orquestación EDC multi-tenant

Diseñado para demostrar intercambio directo de datos entre instituciones sin intermediarios en Fase Estrella del proyecto.
