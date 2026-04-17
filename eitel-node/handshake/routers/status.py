"""
Status routes: GET /status for node info and peer registry.
"""

from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

try:
    # Try relative imports (when run as a package)
    from ..core.session import SessionTokenManager, InvalidTokenError
except ImportError:
    # Fall back to absolute imports (when run as a script)
    from core.session import SessionTokenManager, InvalidTokenError


router = APIRouter(tags=["status"])
security = HTTPBearer(auto_error=False)


# Response models


class PeerStatus(BaseModel):
    """Status of a peer connection."""

    did: str
    registered_at: str  # ISO 8601 timestamp
    status: str  # "active" or "inactive"
    last_interaction: Optional[str] = None  # ISO 8601 timestamp


class StatusResponse(BaseModel):
    """Node status information."""

    node_did: str
    last_handshake: Optional[str] = None  # ISO 8601 timestamp or null
    gx_vp_status: str  # "absent", "valid", "invalid_<reason>" from last handshake
    registered_peers: List[PeerStatus]


class TicketResponse(BaseModel):
    """WebSocket upgrade ticket response."""

    ticket: str
    expires_in: int  # Seconds until expiration


# Dependencies (injected on router initialization)


def init_status_routes(session_manager: SessionTokenManager, node_identity=None) -> None:
    """
    Initialize status router with dependencies.

    Args:
        session_manager: JWT token manager for ticket generation
        node_identity: Node identity object
    """
    router._session_manager = session_manager
    router._node_identity = node_identity
    # TODO: In production, these would come from a persistent state store
    router._last_handshake = None
    router._last_gx_vp_status = "absent"
    router._registered_peers = {}


@router.get("/status", response_model=StatusResponse)
async def get_status(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> StatusResponse:
    """
    Get node status: identity, handshake history, peer registry.

    Returns:
        Node status including DID, last handshake, and registered peers

    Raises:
        HTTPException: 401 if authorization is missing or invalid
    """
    try:
        if not credentials:
            raise HTTPException(status_code=401, detail="Missing Authorization header")

        token = credentials.credentials
        session_manager = router._session_manager

        # Validate token
        try:
            claims = session_manager.validate_token(token)
        except InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

        # Validate audience
        if claims.audience != "handshake":
            raise HTTPException(status_code=401, detail="Invalid audience")

        node_identity = router._node_identity
        last_handshake = getattr(router, "_last_handshake", None)
        gx_vp_status = getattr(router, "_last_gx_vp_status", "absent")
        registered_peers_dict = getattr(router, "_registered_peers", {})

        # Convert peer dict to list of PeerStatus objects
        peers = [
            PeerStatus(
                did=did,
                registered_at=peer_info.get("registered_at", ""),
                status=peer_info.get("status", "active"),
                last_interaction=peer_info.get("last_interaction"),
            )
            for did, peer_info in registered_peers_dict.items()
        ]

        return StatusResponse(
            node_did=node_identity.did,
            last_handshake=last_handshake,
            gx_vp_status=gx_vp_status,
            registered_peers=peers,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Status query failed: {str(e)}")


@router.get("/handshake/ticket", response_model=TicketResponse)
async def get_ticket(authorization: Optional[str] = Header(None)) -> TicketResponse:
    """
    Exchange a session token for a one-time WebSocket upgrade ticket.

    The ticket is single-use and valid for 30 seconds. It should be used in
    WebSocket connection as: WS /ws?ticket=<ticket>

    Args:
        authorization: Bearer token in format "Bearer <token>"

    Returns:
        One-time upgrade ticket

    Raises:
        HTTPException: 401 if token is invalid or missing
    """
    try:
        session_manager = router._session_manager

        # Extract token from Bearer header
        if not authorization:
            raise HTTPException(status_code=401, detail="Missing Authorization header")

        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=401, detail="Authorization header must be Bearer <token>"
            )

        token = authorization[7:]  # Remove "Bearer " prefix

        # Validate token
        try:
            claims = session_manager.validate_token(token)
        except InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

        # Validate audience
        if claims.audience != "handshake":
            raise HTTPException(status_code=401, detail="Invalid audience")

        # Issue ticket
        ticket = session_manager.issue_ticket(token)

        return TicketResponse(ticket=ticket, expires_in=30)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ticket generation failed: {str(e)}")


def update_peer_status(did: str, gx_vp_status: str) -> None:
    """
    Update registered peer after successful handshake.

    Args:
        did: Peer's DID
        gx_vp_status: Status of GX VP validation
    """
    if not hasattr(router, "_registered_peers"):
        router._registered_peers = {}

    now = datetime.now(timezone.utc).isoformat()

    router._registered_peers[did] = {
        "registered_at": now,
        "status": "active",
        "last_interaction": now,
        "gx_vp_status": gx_vp_status,
    }

    # Update last handshake timestamp
    router._last_handshake = now
    router._last_gx_vp_status = gx_vp_status
