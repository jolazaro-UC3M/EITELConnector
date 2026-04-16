"""
EITEL handshake routes: POST /handshake/initiate for dual-VC trust establishment.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from eitel_node.handshake.core.identity import NodeIdentity
from eitel_node.handshake.core.vc_verifier import EITELVCVerifier
from eitel_node.handshake.core.vp_checker import GXVPChecker
from eitel_node.handshake.core.session import SessionTokenManager


router = APIRouter(prefix="/handshake", tags=["handshake"])

# Request/Response models


class InitiateHandshakeRequest(BaseModel):
    """Request to initiate handshake with another node."""

    did: str = Field(..., description="Peer's multibase did:key identifier")
    eitel_vc: dict = Field(..., description="EITEL VC (JSON-LD) issued by coordinator")
    gaia_x_vp: Optional[dict] = Field(
        None, description="Optional GAIA-X Verifiable Presentation"
    )


class InitiateHandshakeResponse(BaseModel):
    """Successful handshake response."""

    status: str = Field("ok", description="Status indicator")
    session_token: str = Field(..., description="JWT token for session authentication")
    node_did: str = Field(..., description="This node's DID")
    peer_did: str = Field(..., description="Peer's DID (echo)")
    gx_vp_status: str = Field(
        ..., description="Status of GX VP validation (valid|invalid_<reason>|absent)"
    )
    dsp_endpoint: str = Field(
        ..., description="EDC DSP endpoint URL for peer to use in negotiation"
    )


class HandshakeError(BaseModel):
    """Error response."""

    detail: str = Field(..., description="Human-readable error message")


# Dependency: access to singletons
# (These are injected via dependency when the router is mounted on the app)


def init_handshake_routes(
    node_identity: NodeIdentity,
    vc_verifier: EITELVCVerifier,
    vp_checker: GXVPChecker,
    session_manager: SessionTokenManager,
    edc_dsp_endpoint: str,
) -> None:
    """
    Initialize the handshake router with required dependencies.

    Args:
        node_identity: This node's cryptographic identity
        vc_verifier: VC validator
        vp_checker: GX VP validator
        session_manager: JWT token manager
        edc_dsp_endpoint: EDC DSP endpoint URL (e.g., "http://localhost:11003/api/v1/dsp")
    """
    # Store globals on the router module for access in endpoint handlers
    router._node_identity = node_identity
    router._vc_verifier = vc_verifier
    router._vp_checker = vp_checker
    router._session_manager = session_manager
    router._edc_dsp_endpoint = edc_dsp_endpoint


@router.post("/initiate", response_model=InitiateHandshakeResponse)
async def initiate_handshake(req: InitiateHandshakeRequest) -> InitiateHandshakeResponse:
    """
    Initiate dual-VC handshake with this node.

    Flow:
    1. Validate EITEL VC (Ed25519 signature, expiration, DID binding)
    2. Optionally validate GX VP (best-effort, non-blocking)
    3. Issue session JWT token
    4. Return token + node DIDs + DSP endpoint

    Args:
        req: Handshake initiation request with peer VC and optional VP

    Returns:
        Session token and node identities

    Raises:
        HTTPException: 400 (Bad Request) for malformed input
        HTTPException: 401 (Unauthorized) for VC validation failures
    """
    try:
        # Access injected dependencies
        node_identity = router._node_identity
        vc_verifier = router._vc_verifier
        vp_checker = router._vp_checker
        session_manager = router._session_manager
        edc_dsp_endpoint = router._edc_dsp_endpoint

        # Step 1: Validate EITEL VC
        vc_result = vc_verifier.verify_vc(req.eitel_vc, req.did)
        if not vc_result.is_valid:
            raise HTTPException(status_code=401, detail=vc_result.error_message)

        # Step 2: Optionally validate GX VP (best-effort, non-blocking)
        gx_vp_status = "absent"
        if req.gaia_x_vp:
            vp_result = vp_checker.check_vp(req.gaia_x_vp, req.did)
            gx_vp_status = (
                "valid" if vp_result.is_valid else f"invalid ({vp_result.error_message})"
            )
            # Log VP status for later inspection via /status endpoint
            # (TODO: persist to database or status cache)

        # Step 3: Issue session token
        session_token = session_manager.issue_token(subject=req.did, audience="handshake")

        # Step 4: Return response
        return InitiateHandshakeResponse(
            status="ok",
            session_token=session_token,
            node_did=node_identity.did,
            peer_did=req.did,
            gx_vp_status=gx_vp_status,
            dsp_endpoint=edc_dsp_endpoint,
        )

    except HTTPException:
        # Re-raise HTTP exceptions (from VC validation)
        raise
    except Exception as e:
        # Catch unexpected errors and return 400
        raise HTTPException(status_code=400, detail=f"Handshake failed: {str(e)}")
