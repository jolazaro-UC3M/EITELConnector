"""
EITEL Node Handshake Service: FastAPI application.

Entry point for the handshake service. Initializes all components (identity,
VC verification, session management) and mounts routers.
"""

import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

try:
    # Try relative imports (when run as a package)
    from .config import load_config
    from .core.identity import NodeIdentity
    from .core.vc_verifier import EITELVCVerifier
    from .core.vp_checker import GXVPChecker
    from .core.session import SessionTokenManager
    from .core.edc_client import EDCClient
    from .routers import handshake, status
except ImportError:
    # Fall back to absolute imports (when run as a script)
    from config import load_config
    from core.identity import NodeIdentity
    from core.vc_verifier import EITELVCVerifier
    from core.vp_checker import GXVPChecker
    from core.session import SessionTokenManager
    from core.edc_client import EDCClient
    from routers import handshake, status


# Create FastAPI app
app = FastAPI(
    title="EITEL Node Handshake Service",
    description="Dual-VC trust handshake for federated dataspace participation",
    version="0.1.0",
)

# Add CORS middleware (allow all origins for PoC)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize components on startup
@app.on_event("startup")
async def startup_event():
    """Initialize all components on application startup."""
    config = load_config()

    # Load or generate node identity
    try:
        node_identity = NodeIdentity.load_or_generate(Path(config.node_identity_dir))
        print(f"[STARTUP] Node DID: {node_identity.did}")
    except Exception as e:
        print(f"[ERROR] Failed to initialize node identity: {e}")
        raise

    # Load coordinator public key
    try:
        coordinator_pubkey_path = Path(config.coordinator_pubkey_jwk_path)
        if not coordinator_pubkey_path.exists():
            raise FileNotFoundError(
                f"Coordinator public key not found: {coordinator_pubkey_path}"
            )
        coordinator_pubkey_data = json.loads(coordinator_pubkey_path.read_text())
        vc_verifier = EITELVCVerifier(coordinator_pubkey_data)
        print("[STARTUP] Coordinator public key loaded")
    except Exception as e:
        print(f"[ERROR] Failed to load coordinator public key: {e}")
        raise

    # Initialize VP checker
    vp_checker = GXVPChecker()

    # Initialize session token manager
    session_manager = SessionTokenManager(
        secret=config.session_token_secret, ttl_seconds=config.session_token_ttl
    )
    print(f"[STARTUP] Session token TTL: {config.session_token_ttl}s")

    # Initialize EDC client
    edc_client = EDCClient(
        management_url=config.edc_management_url, api_key=config.edc_api_key
    )

    # Store components in app state for access by route handlers
    app.state.node_identity = node_identity
    app.state.vc_verifier = vc_verifier
    app.state.vp_checker = vp_checker
    app.state.session_manager = session_manager
    app.state.edc_client = edc_client
    app.state.config = config

    # Initialize routers with dependencies
    handshake.init_handshake_routes(
        node_identity=node_identity,
        vc_verifier=vc_verifier,
        vp_checker=vp_checker,
        session_manager=session_manager,
        edc_dsp_endpoint=config.edc_dsp_endpoint,
    )

    status.init_status_routes(session_manager=session_manager)

    # Also pass node_identity to status router for /status endpoint
    status.router._node_identity = node_identity  # type: ignore

    print("[STARTUP] Handshake service initialized successfully")


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on application shutdown."""
    if hasattr(app.state, "edc_client"):
        await app.state.edc_client.close()
    print("[SHUTDOWN] Handshake service shut down")


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "eitel-node-handshake",
        "node_did": app.state.node_identity.did if hasattr(app.state, "node_identity") else None,
    }


# Mount routers
app.include_router(handshake.router)
app.include_router(status.router)


# Main entry point
if __name__ == "__main__":
    config = load_config()
    uvicorn.run(
        app, host=config.host, port=config.port, log_level="info"
    )
