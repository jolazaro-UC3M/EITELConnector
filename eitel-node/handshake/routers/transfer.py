"""
File transfer routes:
- POST /transfer/download for direct file streaming from Copyparty (legacy, no EDC negotiation)
- POST /transfer/negotiate for EDC-integrated transfer (catalogue -> negotiate -> transfer)
"""

import os
from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

try:
    # Try relative imports (when run as a package)
    from ..core.session import SessionTokenManager, InvalidTokenError
    from ..core.edc_client import EDCClient
except ImportError:
    # Fall back to absolute imports (when run as a script)
    from core.session import SessionTokenManager, InvalidTokenError
    from core.edc_client import EDCClient


router = APIRouter(prefix="/transfer", tags=["transfer"])

# Module-level dependencies
_session_manager: Optional[SessionTokenManager] = None
_edc_client: Optional[EDCClient] = None
_copyparty_url: str = ""
_copyparty_user: str = ""
_copyparty_password: str = ""
_edc_data_plane_url: str = ""


# Request models


class DownloadRequest(BaseModel):
    """File download request."""

    file_path: str


class NegotiateTransferRequest(BaseModel):
    """EDC negotiation request."""

    peer_dsp_endpoint: str
    file_path: str


# Response models


class NegotiateTransferResponse(BaseModel):
    """EDC negotiation response."""

    status: str
    transfer_process_id: Optional[str] = None
    negotiation_id: Optional[str] = None
    asset_id: Optional[str] = None
    error: Optional[str] = None


# Dependencies (injected on router initialization)


def init_transfer_routes(
    session_manager: SessionTokenManager,
    edc_client: Optional[EDCClient] = None,
    edc_data_plane_url: Optional[str] = None
) -> None:
    """
    Initialize transfer router with dependencies.

    Args:
        session_manager: JWT token manager for authentication
        edc_client: EDC management API client (optional, for /transfer/negotiate)
        edc_data_plane_url: URL for EDC data plane destination (e.g., copyparty)
    """
    global _session_manager, _edc_client, _copyparty_url, _copyparty_user, _copyparty_password, _edc_data_plane_url
    _session_manager = session_manager
    _edc_client = edc_client
    _copyparty_url = os.environ.get("COPYPARTY_URL", "http://copyparty:3923")
    _copyparty_user = os.environ.get("COPYPARTY_USER", "eitel")
    _copyparty_password = os.environ.get("COPYPARTY_PASSWORD", "changeme")
    _edc_data_plane_url = edc_data_plane_url or _copyparty_url


@router.post("/download")
async def download_file(
    req: DownloadRequest, authorization: Optional[str] = Header(None)
) -> StreamingResponse:
    """
    Download a file from Copyparty using a valid session token.

    DEPRECATED: This endpoint bypasses EDC contract negotiation. Use /transfer/negotiate instead.

    The session token must be obtained from a prior handshake. Files are served
    from Copyparty's /files/ path and streamed back with attachment disposition.

    Args:
        req: Download request with file_path
        authorization: Bearer token in format "Bearer <token>"

    Returns:
        StreamingResponse with file bytes

    Raises:
        HTTPException: 401 if token is invalid, 404 if file not found,
                      502 for connectivity errors
    """
    try:
        session_manager = _session_manager
        if session_manager is None:
            raise HTTPException(
                status_code=500, detail="Transfer routes not initialized"
            )

        # Extract and validate token
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
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

        # Validate audience
        if claims.audience != "handshake":
            raise HTTPException(status_code=401, detail="Invalid token audience")

        # Sanitize file path
        file_path = req.file_path.lstrip("/")
        if ".." in file_path:
            raise HTTPException(
                status_code=400, detail="Invalid path: parent directory traversal not allowed"
            )

        # Construct Copyparty URL
        full_url = f"{_copyparty_url}/files/{file_path}?pw={_copyparty_password}"

        # Extract filename for Content-Disposition
        filename = file_path.split("/")[-1] if file_path else "file"

        # Proxy request to Copyparty
        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                resp = await client.get(full_url)

                if resp.status_code == 404:
                    raise HTTPException(status_code=404, detail="File not found in Copyparty")

                if resp.status_code != 200:
                    raise HTTPException(
                        status_code=502, detail=f"Copyparty error: {resp.status_code}"
                    )

                return StreamingResponse(
                    resp.aiter_bytes(),
                    media_type=resp.headers.get("Content-Type", "application/octet-stream"),
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'},
                )

            except httpx.RequestError as e:
                raise HTTPException(
                    status_code=502, detail=f"Copyparty connection failed: {str(e)}"
                )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@router.post("/negotiate", response_model=NegotiateTransferResponse)
async def negotiate_transfer(
    req: NegotiateTransferRequest, authorization: Optional[str] = Header(None)
) -> NegotiateTransferResponse:
    """
    Negotiate and initiate EDC transfer for a file via DSP.

    This endpoint implements the full EDC integration flow:
    1. Validate session token (peer is authenticated)
    2. Query peer's catalogue via EDC DSP
    3. Initiate contract negotiation for the asset
    4. Poll until negotiation is FINALIZED
    5. Start the transfer via EDC data plane

    Args:
        req: Negotiation request with peer_dsp_endpoint and file_path
        authorization: Bearer token in format "Bearer <token>"

    Returns:
        NegotiateTransferResponse with transfer process ID or error

    Raises:
        HTTPException: 401 if token invalid, 400 if negotiation fails, 503 if EDC unavailable
    """
    try:
        # Validate dependencies
        session_manager = _session_manager
        edc_client = _edc_client

        if session_manager is None:
            raise HTTPException(
                status_code=500, detail="Transfer routes not initialized"
            )

        if edc_client is None:
            raise HTTPException(
                status_code=503, detail="EDC client not available"
            )

        # Extract and validate token
        if not authorization:
            raise HTTPException(status_code=401, detail="Missing Authorization header")

        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=401, detail="Authorization header must be Bearer <token>"
            )

        token = authorization[7:]

        # Validate token
        try:
            claims = session_manager.validate_token(token)
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

        if claims.audience != "handshake":
            raise HTTPException(status_code=401, detail="Invalid token audience")

        # Get peer DID from token (consumer's DID - the one requesting access)
        peer_did = claims.subject

        # Sanitize file path
        file_path = req.file_path.lstrip("/")
        if ".." in file_path:
            raise HTTPException(
                status_code=400, detail="Invalid path: parent directory traversal not allowed"
            )

        # Step 1: Query peer's catalogue
        catalogue = await edc_client.get_catalogue(req.peer_dsp_endpoint, counterparty_did=peer_did)
        if catalogue.error:
            raise HTTPException(
                status_code=400, detail=f"Failed to query catalogue: {catalogue.error}"
            )

        if not catalogue.assets:
            raise HTTPException(
                status_code=400, detail="Peer catalogue is empty or no assets available"
            )

        # Get the provider's participant ID from the catalogue (fallback to peer_did if not available)
        provider_participant_id = catalogue.provider_id or peer_did

        # Step 2: Resolve file_path to asset_id (simple 1:1 mapping for PoC)
        # For production, this should be a proper lookup table
        matching_asset = None

        # For PoC: try to match by name, or just use the first available asset
        for asset in catalogue.assets:
            asset_name = asset.get("name") or ""
            # Match if name contains 'test' (case-insensitive) or if it's the only asset
            if asset_name.lower() and ("test" in asset_name.lower() or len(catalogue.assets) == 1):
                matching_asset = asset
                break

        # Fallback: use first asset with a name
        if not matching_asset:
            for asset in catalogue.assets:
                if asset.get("name"):
                    matching_asset = asset
                    break

        # Last resort: use first asset
        if not matching_asset and catalogue.assets:
            matching_asset = catalogue.assets[0]

        if not matching_asset:
            raise HTTPException(
                status_code=400,
                detail=f"No suitable asset found in peer catalogue (requested: '{file_path}')"
            )

        # Step 3: Initiate negotiation
        # Use the ODRL offer ID and full policy from the DCAT response
        asset_id = matching_asset.get("id")
        offer_id = matching_asset.get("offer_id") or asset_id
        policy = matching_asset.get("policy", {})
        negotiation = await edc_client.initiate_negotiation(
            counterparty_dsp_url=req.peer_dsp_endpoint,
            offer_id=offer_id,
            asset_id=asset_id,
            counterparty_did=provider_participant_id,
            policy=policy
        )

        if negotiation.error:
            raise HTTPException(
                status_code=400, detail=f"Failed to initiate negotiation: {negotiation.error}"
            )

        # Step 4: Poll until negotiation is finalized
        final_negotiation = await edc_client.poll_negotiation_state(
            negotiation.id, max_retries=30, retry_delay=1.0
        )

        if final_negotiation.error or final_negotiation.state not in ("FINALIZED",):
            error_msg = final_negotiation.error or f"Negotiation state: {final_negotiation.state}"
            raise HTTPException(
                status_code=400, detail=f"Negotiation failed: {error_msg}"
            )

        if not final_negotiation.contract_agreement_id:
            raise HTTPException(
                status_code=400, detail="Negotiation finalized but no contract agreement ID"
            )

        # Step 5: Start transfer
        transfer = await edc_client.start_transfer(
            contract_id=final_negotiation.contract_agreement_id,
            asset_id=asset_id,
            counterparty_dsp_url=req.peer_dsp_endpoint,
            destination_url=_edc_data_plane_url
        )

        if transfer.error:
            raise HTTPException(
                status_code=400, detail=f"Failed to start transfer: {transfer.error}"
            )

        return NegotiateTransferResponse(
            status="ok",
            transfer_process_id=transfer.id,
            negotiation_id=final_negotiation.id,
            asset_id=asset_id,
            error=None
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Negotiation failed: {str(e)}")


