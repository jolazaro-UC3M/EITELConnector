"""
File transfer routes: POST /transfer/download for streaming files from Copyparty.
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
except ImportError:
    # Fall back to absolute imports (when run as a script)
    from core.session import SessionTokenManager, InvalidTokenError


router = APIRouter(prefix="/transfer", tags=["transfer"])

# Module-level dependencies
_session_manager: Optional[SessionTokenManager] = None
_copyparty_url: str = ""
_copyparty_user: str = ""
_copyparty_password: str = ""


# Request models


class DownloadRequest(BaseModel):
    """File download request."""

    file_path: str


# Dependencies (injected on router initialization)


def init_transfer_routes(session_manager: SessionTokenManager) -> None:
    """
    Initialize transfer router with dependencies.

    Args:
        session_manager: JWT token manager for authentication
    """
    global _session_manager, _copyparty_url, _copyparty_user, _copyparty_password
    _session_manager = session_manager
    _copyparty_url = os.environ.get("COPYPARTY_URL", "http://copyparty:3923")
    _copyparty_user = os.environ.get("COPYPARTY_USER", "eitel")
    _copyparty_password = os.environ.get("COPYPARTY_PASSWORD", "changeme")


@router.post("/download")
async def download_file(
    req: DownloadRequest, authorization: Optional[str] = Header(None)
) -> StreamingResponse:
    """
    Download a file from Copyparty using a valid session token.

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
        except InvalidTokenError as e:
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
