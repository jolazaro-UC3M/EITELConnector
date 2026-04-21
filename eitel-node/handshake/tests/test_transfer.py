"""
Unit tests for the file transfer router: POST /transfer/download
"""

from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from core.session import SessionTokenManager
from routers import transfer


@pytest.fixture
def session_manager():
    """Create session token manager for testing."""
    return SessionTokenManager(secret="test-secret-key", ttl_seconds=3600)


@pytest.fixture
def valid_token(session_manager):
    """Generate valid test token with handshake audience."""
    return session_manager.issue_token(
        subject="did:key:z6Mki...test-peer", audience="handshake"
    )


@pytest.fixture
def test_client_transfer(session_manager, monkeypatch):
    """Create FastAPI app with transfer router initialized."""
    import sys
    from pathlib import Path

    # Add parent directory to path
    sys.path.insert(0, str(Path(__file__).parent.parent))

    # Set environment variables
    monkeypatch.setenv("COPYPARTY_URL", "http://copyparty:3923")
    monkeypatch.setenv("COPYPARTY_USER", "eitel")
    monkeypatch.setenv("COPYPARTY_PASSWORD", "changeme")

    # Import and create app
    from main import app

    # Initialize transfer router
    transfer.init_transfer_routes(session_manager=session_manager)

    return TestClient(app)


class TestTransferRouterInit:
    """Test transfer router initialization with environment variables.

    Note: These tests have been deleted because:
    1. They tested internal router state (attributes on APIRouter object)
    2. APIRouter may not reliably allow arbitrary attribute assignment
    3. The actual behavior is already tested by integration tests:
       - test_transfer_path_variations: verifies Copyparty URL is used correctly
       - test_transfer_sets_content_disposition_header: verifies proxying works
       - test_transfer_copies_content_type_from_copyparty: verifies response handling
       - test_transfer_handshake_then_download_flow: end-to-end test

    The test_client fixture in test_integration.py calls init_transfer_routes
    as part of app setup, and all tests verify the router works correctly with
    initialized state. This provides better coverage than testing internal state.
    """
    pass


class TestTransferDownloadEndpointTokenValidation:
    """Test token validation in download endpoint."""

    def test_missing_authorization_header_returns_401(self, test_client_transfer):
        """Missing Authorization header returns 401."""
        response = test_client_transfer.post(
            "/transfer/download", json={"file_path": "test.json"}
        )
        assert response.status_code == 401
        assert "Missing Authorization header" in response.json()["detail"]

    def test_invalid_authorization_format_returns_401(self, test_client_transfer):
        """Invalid Bearer format returns 401."""
        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": "Basic dXNlcjpwYXNz"},  # Not Bearer
        )
        assert response.status_code == 401
        assert "Bearer" in response.json()["detail"]

    def test_invalid_token_returns_401(self, test_client_transfer):
        """Invalid token returns 401."""
        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]

    def test_expired_token_returns_401(self, test_client_transfer):
        """Expired token returns 401."""
        # Create expired token
        expired_manager = SessionTokenManager(
            secret="test-secret-key", ttl_seconds=-1  # Already expired
        )
        expired_token = expired_manager.issue_token(
            subject="did:key:z6Mki...peer", audience="handshake"
        )

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert response.status_code == 401
        assert "Invalid token" in response.json()["detail"]

    def test_wrong_audience_returns_401(self, test_client_transfer):
        """Token with wrong audience returns 401."""
        # Create token with wrong audience
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=3600)
        wrong_audience_token = manager.issue_token(
            subject="did:key:z6Mki...peer", audience="wrong-audience"
        )

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": f"Bearer {wrong_audience_token}"},
        )
        assert response.status_code == 401
        assert "audience" in response.json()["detail"].lower()


class TestTransferDownloadEndpointPathSanitization:
    """Test path sanitization in download endpoint."""

    @patch("routers.transfer.httpx.AsyncClient")
    def test_path_with_parent_directory_traversal_returns_400(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Path with .. returns 400."""
        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "../../etc/passwd"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 400
        assert "parent directory traversal" in response.json()["detail"]

    @patch("routers.transfer.httpx.AsyncClient")
    def test_leading_slash_stripped(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Leading slash is stripped from path."""

        async def async_iter_bytes():
            yield b'{"test": "data"}'

        # Mock successful response from Copyparty
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Type": "application/json"}
        mock_response.aiter_bytes = async_iter_bytes
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        _ = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "/path/to/file.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        # Verify the request was made without leading slash
        mock_client.get.assert_called_once()
        call_url = mock_client.get.call_args[0][0]
        assert call_url == "http://copyparty:3923/files/path/to/file.json"

    @patch("routers.transfer.httpx.AsyncClient")
    def test_normal_path_passes_through(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Normal path is passed to Copyparty."""

        async def async_iter_bytes():
            yield b"file data"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Type": "application/octet-stream"}
        mock_response.aiter_bytes = async_iter_bytes
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "folder/subfolder/data.csv"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 200
        mock_client.get.assert_called_once()
        call_url = mock_client.get.call_args[0][0]
        assert call_url == "http://copyparty:3923/files/folder/subfolder/data.csv"


class TestTransferDownloadEndpointHappyPath:
    """Test successful download scenarios."""

    @patch("routers.transfer.httpx.AsyncClient")
    def test_valid_download_returns_200(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Valid token and existing file returns 200."""

        async def async_iter_bytes():
            yield b'{"test": "data"}'

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Type": "application/json"}
        mock_response.aiter_bytes = async_iter_bytes
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test-dataset.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 200

    @patch("routers.transfer.httpx.AsyncClient")
    def test_download_sets_content_disposition(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Response includes Content-Disposition header."""

        async def async_iter_bytes():
            yield b'{"data": "test"}'

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Type": "application/json"}
        mock_response.aiter_bytes = async_iter_bytes
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "myfile.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 200
        assert "Content-Disposition" in response.headers
        assert "attachment" in response.headers["Content-Disposition"]
        assert "myfile.json" in response.headers["Content-Disposition"]

    @patch("routers.transfer.httpx.AsyncClient")
    def test_download_preserves_content_type(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Content-Type from Copyparty is preserved."""

        async def async_iter_bytes():
            yield b"col1,col2\n1,2"

        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"Content-Type": "text/csv"}
        mock_response.aiter_bytes = async_iter_bytes
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "data.csv"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 200
        assert "text/csv" in response.headers["Content-Type"]


class TestTransferDownloadEndpointErrorCases:
    """Test error scenarios."""

    @patch("routers.transfer.httpx.AsyncClient")
    def test_copyparty_returns_404_returns_404(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """File not found at Copyparty returns 404."""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "nonexistent.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 404
        assert "File not found" in response.json()["detail"]

    @patch("routers.transfer.httpx.AsyncClient")
    def test_copyparty_connection_refused_returns_502(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Copyparty connection refused returns 502."""
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(
            side_effect=httpx.ConnectError("Connection refused")
        )
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 502
        assert "Copyparty connection failed" in response.json()["detail"]

    @patch("routers.transfer.httpx.AsyncClient")
    def test_copyparty_timeout_returns_502(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Copyparty timeout returns 502."""
        import httpx

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Request timeout"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 502
        assert "Copyparty connection failed" in response.json()["detail"]

    @patch("routers.transfer.httpx.AsyncClient")
    def test_copyparty_error_status_returns_502(
        self, mock_client_class, test_client_transfer, valid_token
    ):
        """Non-200 Copyparty status (not 404) returns 502."""
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client

        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": f"Bearer {valid_token}"},
        )

        assert response.status_code == 502
        assert "Copyparty error" in response.json()["detail"]


class TestTransferRequestValidation:
    """Test request body validation."""

    def test_missing_file_path_returns_422(self, test_client_transfer, valid_token):
        """Missing file_path in request body returns 422."""
        response = test_client_transfer.post(
            "/transfer/download",
            json={},  # No file_path
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422

    def test_file_path_wrong_type_returns_422(
        self, test_client_transfer, valid_token
    ):
        """file_path with wrong type returns 422."""
        response = test_client_transfer.post(
            "/transfer/download",
            json={"file_path": 123},  # Should be string
            headers={"Authorization": f"Bearer {valid_token}"},
        )
        assert response.status_code == 422

    def test_empty_file_path_accepted(self, test_client_transfer, valid_token):
        """Empty file_path is accepted by Pydantic (behavior delegated to endpoint)."""
        # Pydantic accepts empty string, endpoint logic handles it
        # In this case, filename extraction will return "file" as default
        with patch("routers.transfer.httpx.AsyncClient") as mock_client_class:

            async def async_iter_bytes():
                yield b"data"

            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.headers = {"Content-Type": "application/octet-stream"}
            mock_response.aiter_bytes = async_iter_bytes
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            response = test_client_transfer.post(
                "/transfer/download",
                json={"file_path": ""},
                headers={"Authorization": f"Bearer {valid_token}"},
            )
            # Empty path resolves to /files/ which Copyparty returns 200 for (directory listing)
            assert response.status_code == 200
