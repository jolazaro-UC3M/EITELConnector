"""
Integration tests for the full EITEL Node Handshake Service.

These tests start the FastAPI app and make HTTP requests to test the full flow.
"""

import json
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from jwcrypto import jws, jwk
from cryptography.hazmat.primitives.asymmetric import ed25519

# Add handshake directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import app
from config import Config
from core.identity import NodeIdentity
from routers import transfer


@pytest.fixture
def coordinator_keys():
    """Generate coordinator Ed25519 keypair for testing."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    # Create JWK
    key_obj = jwk.JWK.from_pyca(public_key)
    jwk_dict = key_obj.export_public(as_dict=True)
    jwk_dict["kid"] = "test-coordinator"
    jwk_dict["use"] = "sig"

    return {
        "private_key": private_key,
        "public_key": public_key,
        "jwk_dict": jwk_dict,
    }


@pytest.fixture
def temp_identity_dir():
    """Create temporary directory for node identity."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def test_client(coordinator_keys, temp_identity_dir, monkeypatch):
    """Create test client with properly initialized app state."""
    from core.identity import NodeIdentity
    from core.vc_verifier import EITELVCVerifier
    from core.vp_checker import GXVPChecker
    from core.session import SessionTokenManager
    from core.edc_client import EDCClient
    from routers import handshake, status

    # Create temp identity dir
    identity_dir = temp_identity_dir / "node_identity"
    identity_dir.mkdir(parents=True, exist_ok=True)

    # Create JWK file with coordinator key
    jwk_file = temp_identity_dir / "coordinator.jwk"
    jwk_file.write_text(json.dumps(coordinator_keys["jwk_dict"]))

    # Set environment variables
    monkeypatch.setenv("EITEL_NODE_COORDINATOR_PUBKEY_JWK_PATH", str(jwk_file))
    monkeypatch.setenv("EITEL_NODE_NODE_IDENTITY_DIR", str(identity_dir))
    monkeypatch.setenv("EITEL_NODE_SESSION_TOKEN_SECRET", "test-secret-key-12345")
    monkeypatch.setenv("EITEL_NODE_EDC_MANAGEMENT_URL", "http://localhost:8182")
    monkeypatch.setenv("EITEL_NODE_EDC_API_KEY", "test-api-key")

    # Load config
    config = Config()

    # Initialize components
    node_identity = NodeIdentity.load_or_generate(Path(config.node_identity_dir))
    vc_verifier = EITELVCVerifier(str(jwk_file))
    vp_checker = GXVPChecker()
    session_manager = SessionTokenManager(
        secret=config.session_token_secret, ttl_seconds=config.session_token_ttl
    )
    edc_client = EDCClient(
        management_url=config.edc_management_url, api_key=config.edc_api_key
    )

    # Store components in app state
    app.state.node_identity = node_identity
    app.state.vc_verifier = vc_verifier
    app.state.vp_checker = vp_checker
    app.state.session_manager = session_manager
    app.state.edc_client = edc_client
    app.state.config = config

    # Initialize routers
    handshake.init_handshake_routes(
        node_identity=node_identity,
        vc_verifier=vc_verifier,
        vp_checker=vp_checker,
        session_manager=session_manager,
        edc_dsp_endpoint="http://localhost:11003/api/v1/dsp",
    )
    status.init_status_routes(session_manager=session_manager, node_identity=node_identity)
    transfer.init_transfer_routes(session_manager=session_manager)

    return TestClient(app)


class TestAppStartup:
    """Test that the app initializes correctly."""

    def test_app_imports(self):
        """App can be imported without errors."""
        assert app is not None
        assert app.title == "EITEL Node Handshake Service"

    def test_health_endpoint(self, test_client):
        """Health check endpoint returns 200."""
        response = test_client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert "node_did" in body


class TestHandshakeIntegration:
    """Integration tests for the handshake endpoint."""

    def test_handshake_with_valid_vc(self, test_client, coordinator_keys, temp_identity_dir):
        """Complete handshake flow with valid VC."""
        # Generate peer identity
        peer_identity = NodeIdentity.load_or_generate(temp_identity_dir / "peer")

        # Create VC payload
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "issuanceDate": "2025-04-15T10:00:00Z",
            "credentialSubject": {
                "id": peer_identity.did,
                "institution": "UC3M",
                "role": "participant",
            },
        }

        # Sign with coordinator key
        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        # Build VC with proof
        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Send handshake request
        request_body = {
            "did": peer_identity.did,
            "eitel_vc": vc,
        }

        response = test_client.post("/handshake/initiate", json=request_body)

        # Verify response
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert "session_token" in body
        assert body["node_did"].startswith("did:key:z")
        assert body["peer_did"] == peer_identity.did
        assert body["gx_vp_status"] == "absent"
        assert body["dsp_endpoint"]

    def test_handshake_missing_required_fields(self, test_client):
        """Handshake without required fields fails."""
        # Missing 'did'
        response = test_client.post("/handshake/initiate", json={"eitel_vc": {}})
        assert response.status_code == 422

        # Missing 'eitel_vc'
        response = test_client.post("/handshake/initiate", json={"did": "did:key:test"})
        assert response.status_code == 422

    def test_handshake_invalid_vc(self, test_client, temp_identity_dir):
        """Handshake with malformed VC fails."""
        peer_identity = NodeIdentity.load_or_generate(temp_identity_dir / "invalid_vc")

        request_body = {
            "did": peer_identity.did,
            "eitel_vc": {"invalid": "vc"},
        }

        response = test_client.post("/handshake/initiate", json=request_body)
        assert response.status_code in [400, 401]

    def test_handshake_invalid_signature(self, test_client, temp_identity_dir):
        """Handshake with invalid signature fails."""
        peer_identity = NodeIdentity.load_or_generate(temp_identity_dir / "invalid_sig")

        # Create VC with wrong key
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": peer_identity.did},
        }

        # Sign with WRONG key
        wrong_key = jwk.JWK.from_pyca(ed25519.Ed25519PrivateKey.generate())
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(wrong_key, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        request_body = {"did": peer_identity.did, "eitel_vc": vc}

        response = test_client.post("/handshake/initiate", json=request_body)
        assert response.status_code == 401


class TestStatusEndpoint:
    """Tests for the /status endpoint."""

    def test_status_endpoint(self, test_client):
        """Status endpoint returns node information when authenticated."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        # Issue a valid token
        token = session_manager.issue_token(
            subject=node_identity.did, audience="handshake", issuer=node_identity.did
        )

        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.get("/status", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert "node_did" in body
        assert "registered_peers" in body
        assert "last_handshake" in body
        assert "gx_vp_status" in body

    def test_status_requires_authentication(self, test_client):
        """Status endpoint requires authentication."""
        response = test_client.get("/status")
        assert response.status_code == 401

    def test_status_rejects_wrong_audience(self, test_client):
        """Status endpoint rejects tokens with wrong audience."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        # Issue a token with wrong audience
        token = session_manager.issue_token(
            subject=node_identity.did, audience="wrong", issuer=node_identity.did
        )

        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.get("/status", headers=headers)
        assert response.status_code == 401

    def test_status_endpoint_after_handshake(self, test_client, coordinator_keys, temp_identity_dir):
        """Status endpoint reflects handshake information when authenticated."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        # Complete a handshake first
        peer_identity = NodeIdentity.load_or_generate(temp_identity_dir / "peer_handshake")

        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": peer_identity.did},
        }

        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Complete handshake
        handshake_response = test_client.post(
            "/handshake/initiate", json={"did": peer_identity.did, "eitel_vc": vc}
        )
        assert handshake_response.status_code == 200

        # Issue a valid token for authentication
        token = session_manager.issue_token(
            subject=node_identity.did, audience="handshake", issuer=node_identity.did
        )

        # Check status now has peer registered
        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.get("/status", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert "node_did" in body
        assert "registered_peers" in body
        assert len(body["registered_peers"]) > 0
        assert body["registered_peers"][0]["did"] == peer_identity.did


class TestTicketEndpoint:
    """Tests for the /handshake/ticket endpoint."""

    def test_ticket_accepts_valid_token_with_handshake_audience(self, test_client):
        """Ticket endpoint accepts tokens with handshake audience."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        # Issue a valid token with correct audience
        token = session_manager.issue_token(
            subject=node_identity.did, audience="handshake", issuer=node_identity.did
        )

        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.get("/handshake/ticket", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert "ticket" in body
        assert body["expires_in"] == 30

    def test_ticket_rejects_wrong_audience(self, test_client):
        """Ticket endpoint rejects tokens with wrong audience."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        # Issue a token with wrong audience
        token = session_manager.issue_token(
            subject=node_identity.did, audience="wrong", issuer=node_identity.did
        )

        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.get("/handshake/ticket", headers=headers)
        assert response.status_code == 401


class TestEndToEnd:
    """End-to-end scenario tests."""

    def test_handshake_token_issuance(self, test_client, coordinator_keys, temp_identity_dir):
        """Test that handshake issues a valid session token."""
        peer_identity = NodeIdentity.load_or_generate(temp_identity_dir / "token_test")

        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": peer_identity.did},
        }

        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        request_body = {"did": peer_identity.did, "eitel_vc": vc}
        response = test_client.post("/handshake/initiate", json=request_body)

        assert response.status_code == 200
        body = response.json()
        assert "session_token" in body
        session_token = body["session_token"]

        # Token should be a non-empty string
        assert isinstance(session_token, str)
        assert len(session_token) > 0
        # JWT tokens have three parts separated by dots
        assert session_token.count(".") == 2


class TestTransferEndpointIntegration:
    """Integration tests for the /transfer/download endpoint."""

    @pytest.fixture
    def transfer_session_token(self, test_client):
        """Valid session token for transfer testing."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        return session_manager.issue_token(
            subject=node_identity.did, audience="handshake", issuer=node_identity.did
        )

    def test_transfer_requires_authentication(self, test_client):
        """Transfer endpoint requires authentication."""
        response = test_client.post(
            "/transfer/download", json={"file_path": "test.json"}
        )
        assert response.status_code == 401

    def test_transfer_requires_bearer_token(self, test_client, transfer_session_token):
        """Transfer endpoint requires Bearer token format."""
        # Try with Basic auth instead
        response = test_client.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": "Basic dXNlcjpwYXNz"},
        )
        assert response.status_code == 401

    def test_transfer_rejects_wrong_audience(self, test_client):
        """Transfer endpoint rejects tokens with wrong audience."""
        session_manager = test_client.app.state.session_manager
        node_identity = test_client.app.state.node_identity

        # Issue token with wrong audience
        wrong_audience_token = session_manager.issue_token(
            subject=node_identity.did, audience="wrong", issuer=node_identity.did
        )

        response = test_client.post(
            "/transfer/download",
            json={"file_path": "test.json"},
            headers={"Authorization": f"Bearer {wrong_audience_token}"},
        )
        assert response.status_code == 401
        assert "audience" in response.json()["detail"].lower()

    def test_transfer_rejects_path_traversal(self, test_client, transfer_session_token):
        """Transfer endpoint rejects paths with parent directory traversal."""
        response = test_client.post(
            "/transfer/download",
            json={"file_path": "../../etc/passwd"},
            headers={"Authorization": f"Bearer {transfer_session_token}"},
        )
        assert response.status_code == 400
        assert "parent directory traversal" in response.json()["detail"]

    def test_transfer_validates_file_path_required(self, test_client, transfer_session_token):
        """Transfer endpoint requires file_path in request body."""
        response = test_client.post(
            "/transfer/download",
            json={},  # Missing file_path
            headers={"Authorization": f"Bearer {transfer_session_token}"},
        )
        assert response.status_code == 422

    @pytest.mark.parametrize(
        "file_path,expected_in_url",
        [
            ("data.json", "/files/data.json"),
            ("/data.json", "/files/data.json"),  # Leading slash stripped
            ("folder/data.json", "/files/folder/data.json"),
            ("/folder/subfolder/data.csv", "/files/folder/subfolder/data.csv"),
        ],
    )
    def test_transfer_path_variations(
        self, test_client, transfer_session_token, file_path, expected_in_url
    ):
        """Transfer endpoint handles various path formats correctly."""
        from unittest.mock import patch, AsyncMock, MagicMock

        with patch("routers.transfer.httpx.AsyncClient") as mock_client_class:

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

            _ = test_client.post(
                "/transfer/download",
                json={"file_path": file_path},
                headers={"Authorization": f"Bearer {transfer_session_token}"},
            )

            # Verify the request was made with the correct sanitized URL
            mock_client.get.assert_called_once()
            call_url = mock_client.get.call_args[0][0]
            assert expected_in_url in call_url

    def test_transfer_sets_content_disposition_header(
        self, test_client, transfer_session_token
    ):
        """Transfer endpoint sets Content-Disposition header with filename."""
        from unittest.mock import patch, AsyncMock, MagicMock

        with patch("routers.transfer.httpx.AsyncClient") as mock_client_class:

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

            response = test_client.post(
                "/transfer/download",
                json={"file_path": "myfile.json"},
                headers={"Authorization": f"Bearer {transfer_session_token}"},
            )

            assert response.status_code == 200
            assert "Content-Disposition" in response.headers
            assert "attachment" in response.headers["Content-Disposition"]
            assert "myfile.json" in response.headers["Content-Disposition"]

    def test_transfer_copies_content_type_from_copyparty(
        self, test_client, transfer_session_token
    ):
        """Transfer endpoint preserves Content-Type from Copyparty."""
        from unittest.mock import patch, AsyncMock, MagicMock

        with patch("routers.transfer.httpx.AsyncClient") as mock_client_class:

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

            response = test_client.post(
                "/transfer/download",
                json={"file_path": "data.csv"},
                headers={"Authorization": f"Bearer {transfer_session_token}"},
            )

            assert response.status_code == 200
            assert "text/csv" in response.headers["Content-Type"]

    def test_transfer_handshake_then_download_flow(
        self, test_client, coordinator_keys, temp_identity_dir
    ):
        """Full flow: handshake → get token → transfer download."""
        from unittest.mock import patch, AsyncMock, MagicMock

        # 1. Complete handshake to get session token
        peer_identity = NodeIdentity.load_or_generate(temp_identity_dir / "transfer_test")

        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": peer_identity.did},
        }

        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        handshake_response = test_client.post(
            "/handshake/initiate", json={"did": peer_identity.did, "eitel_vc": vc}
        )
        assert handshake_response.status_code == 200
        handshake_token = handshake_response.json()["session_token"]

        # 2. Use handshake token in transfer request
        with patch("routers.transfer.httpx.AsyncClient") as mock_client_class:

            async def async_iter_bytes():
                yield b'{"result": "success"}'

            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.headers = {"Content-Type": "application/json"}
            mock_response.aiter_bytes = async_iter_bytes
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            transfer_response = test_client.post(
                "/transfer/download",
                json={"file_path": "test-dataset.json"},
                headers={"Authorization": f"Bearer {handshake_token}"},
            )

            # 3. Verify successful download
            assert transfer_response.status_code == 200
            assert "attachment" in transfer_response.headers["Content-Disposition"]

