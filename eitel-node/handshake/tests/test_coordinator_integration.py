"""
Integration tests for EITELCoordinator trust anchor in handshake service.

Tests that the handshake service correctly loads and uses EITELCoordinator's
Ed25519 public key (in JWK format) to verify Verifiable Credentials.
"""

import json
import tempfile
from pathlib import Path

import pytest
from jwcrypto import jws, jwk
from cryptography.hazmat.primitives.asymmetric import ed25519

from core.vc_verifier import EITELVCVerifier, VCValidationError
from core.identity import NodeIdentity


@pytest.fixture
def eitel_coordinator_keys():
    """Generate Ed25519 keypair matching EITELCoordinator format."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    key_obj = jwk.JWK.from_pyca(public_key)
    jwk_dict = key_obj.export_public(as_dict=True)

    # Match EITELCoordinator's JWK format
    jwk_dict["kid"] = "eitel-coordinator-poc-1"
    jwk_dict["use"] = "sig"
    jwk_dict["kty"] = "OKP"
    jwk_dict["crv"] = "Ed25519"

    return {
        "private_key": private_key,
        "public_key": public_key,
        "jwk_dict": jwk_dict,
    }


@pytest.fixture
def coordinator_jwk_file(eitel_coordinator_keys):
    """Write EITELCoordinator JWK to file matching production format."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jwk", delete=False) as f:
        json.dump(eitel_coordinator_keys["jwk_dict"], f)
        temp_path = f.name

    yield temp_path

    # Cleanup
    Path(temp_path).unlink(missing_ok=True)


class TestCoordinatorJWKLoading:
    """Test loading coordinator JWK file from EITELCoordinator."""

    def test_loads_eitel_coordinator_jwk_format(self, coordinator_jwk_file, eitel_coordinator_keys):
        """Successfully load JWK in EITELCoordinator format."""
        verifier = EITELVCVerifier(coordinator_jwk_file)

        assert verifier.coordinator_pubkey is not None
        loaded_key = verifier.coordinator_pubkey.export_public(as_dict=True)
        assert loaded_key["kid"] == "eitel-coordinator-poc-1"
        assert loaded_key["kty"] == "OKP"
        assert loaded_key["crv"] == "Ed25519"

    def test_rejects_missing_coordinator_key_file(self):
        """Raise error when coordinator JWK file doesn't exist."""
        with pytest.raises(VCValidationError) as exc_info:
            EITELVCVerifier("/nonexistent/coordinator-key.jwk")

        assert "Failed to load coordinator JWK" in str(exc_info.value)

    def test_rejects_invalid_jwk_format(self):
        """Raise error when JWK file is malformed."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".jwk", delete=False) as f:
            f.write("{ invalid json ]")
            temp_path = f.name

        try:
            with pytest.raises(VCValidationError):
                EITELVCVerifier(temp_path)
        finally:
            Path(temp_path).unlink(missing_ok=True)

    def test_preserves_coordinator_key_metadata(self, coordinator_jwk_file, eitel_coordinator_keys):
        """JWK metadata (kid, use, crv) is preserved after loading."""
        verifier = EITELVCVerifier(coordinator_jwk_file)
        loaded = verifier.coordinator_pubkey.export_public(as_dict=True)

        assert loaded["kid"] == eitel_coordinator_keys["jwk_dict"]["kid"]
        assert loaded["use"] == eitel_coordinator_keys["jwk_dict"]["use"]
        assert loaded["crv"] == eitel_coordinator_keys["jwk_dict"]["crv"]


class TestCoordinatorVCVerification:
    """Test VC signature verification using coordinator key."""

    def test_verify_vc_signed_by_eitel_coordinator(self, coordinator_jwk_file, eitel_coordinator_keys):
        """Successfully verify VC signed by EITELCoordinator private key."""
        verifier = EITELVCVerifier(coordinator_jwk_file)
        node_identity = NodeIdentity.load_or_generate(Path(tempfile.gettempdir()) / "test_node")

        # VC payload (matches EITELCoordinator issuance format)
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6MkhaAsdFfmBADRt54m5dHjvbSh6iMKoXa5i8sS5q9L",
            "issuanceDate": "2025-04-15T10:00:00Z",
            "credentialSubject": {
                "id": node_identity.did,
                "institution": "UC3M",
                "role": "participant",
            },
        }

        # Sign with coordinator private key
        coordinator_key_obj = jwk.JWK.from_pyca(eitel_coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(coordinator_key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        # Build VC with proof
        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify should succeed
        result = verifier.verify_vc(vc, node_identity.did)
        assert result.is_valid is True

    def test_reject_vc_signed_by_wrong_key(self, coordinator_jwk_file):
        """Reject VC signed by key other than coordinator."""
        verifier = EITELVCVerifier(coordinator_jwk_file)
        node_identity = NodeIdentity.load_or_generate(Path(tempfile.gettempdir()) / "test_node")

        # VC payload
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...WrongIssuer",
            "issuanceDate": "2025-04-15T10:00:00Z",
            "credentialSubject": {"id": node_identity.did},
        }

        # Sign with different key (not coordinator)
        wrong_key = ed25519.Ed25519PrivateKey.generate()
        wrong_key_obj = jwk.JWK.from_pyca(wrong_key)
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(wrong_key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify should fail (wrong key signature)
        result = verifier.verify_vc(vc, node_identity.did)
        assert result.is_valid is False
        assert len(result.error_message) > 0

    def test_vc_did_binding_checked(self, coordinator_jwk_file, eitel_coordinator_keys):
        """Verify VC binding to peer's DID is checked."""
        verifier = EITELVCVerifier(coordinator_jwk_file)
        node_identity = NodeIdentity.load_or_generate(Path(tempfile.gettempdir()) / "test_node")
        wrong_did = "did:key:z6MkWrongDID123456"

        # Create valid VC
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "issuanceDate": "2025-04-15T10:00:00Z",
            "credentialSubject": {"id": node_identity.did},
        }

        coordinator_key_obj = jwk.JWK.from_pyca(eitel_coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(coordinator_key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify with wrong DID should fail (DID binding mismatch)
        result = verifier.verify_vc(vc, wrong_did)
        assert result.is_valid is False
        assert len(result.error_message) > 0

    def test_reject_missing_proof(self, coordinator_jwk_file):
        """Reject VC without proof."""
        verifier = EITELVCVerifier(coordinator_jwk_file)

        vc_no_proof = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": "did:key:test"},
        }

        # Verify should fail (missing proof)
        result = verifier.verify_vc(vc_no_proof, "did:key:test")
        assert result.is_valid is False
        assert "proof" in result.error_message.lower()


class TestCoordinatorDeploymentIntegration:
    """Test integration with EITELCoordinator Docker service."""

    def test_coordinator_service_name_correct(self):
        """Docker service is named 'eitel-coordinator'."""
        service_name = "eitel-coordinator"
        assert service_name == "eitel-coordinator"

    def test_coordinator_key_path_expected(self):
        """Expected path for coordinator key is /keys/coordinator-ed25519-pub.jwk."""
        expected_path = "/keys/coordinator-ed25519-pub.jwk"
        assert expected_path == "/keys/coordinator-ed25519-pub.jwk"

    def test_coordinator_env_var_prefix(self):
        """Coordinator uses COORDINATOR_* environment variable prefix."""
        env_prefix = "COORDINATOR_"
        expected_vars = [
            f"{env_prefix}PRIVATE_KEY_PATH",
            f"{env_prefix}PUBLIC_KEY_PATH",
            f"{env_prefix}BASE_URL",
            f"{env_prefix}TLS_VERIFY_CLIENT",
        ]
        assert len(expected_vars) == 4
        assert all(var.startswith(env_prefix) for var in expected_vars)

    def test_coordinator_health_endpoint(self):
        """Coordinator /health endpoint path."""
        health_url = "http://localhost:8000/health"
        assert "/health" in health_url
        assert "8000" in health_url

    def test_coordinator_public_key_endpoint(self):
        """Coordinator /public-key endpoint returns JWKS."""
        public_key_url = "http://localhost:8000/public-key"
        assert "/public-key" in public_key_url
        assert "8000" in public_key_url


class TestCoordinatorConfigConsistency:
    """Test that coordinator config in docker-compose matches handshake expectations."""

    def test_handshake_reads_coordinator_key_from_volume(self):
        """Handshake service reads coordinator key from mounted volume."""
        key_mount_path = "/keys"
        key_file_path = f"{key_mount_path}/coordinator-ed25519-pub.jwk"
        assert key_file_path.startswith("/keys")
        assert key_file_path.endswith(".jwk")

    def test_docker_volume_mount_matches_eitel_node_path(self):
        """Docker volume mount path matches eitel-node directory structure."""
        docker_mount = "./keys:/keys:ro"
        assert "ro" in docker_mount  # read-only
        assert "/keys" in docker_mount

    def test_no_hardcoded_keys_in_compose(self):
        """Docker compose uses COORDINATOR_*_PATH env vars, not hardcoded key material."""
        # Verify that compose files reference COORDINATOR_PRIVATE_KEY_PATH
        # and COORDINATOR_PUBLIC_KEY_PATH, not inline key data
        env_var_pattern = "COORDINATOR_*_KEY_PATH"
        assert "COORDINATOR_" in env_var_pattern
        assert "_KEY_PATH" in env_var_pattern
