"""
Tests for VC verification: JWS signature validation with coordinator public key.
"""

import json
import tempfile
from pathlib import Path

import pytest
from jwcrypto import jws, jwk
from cryptography.hazmat.primitives.asymmetric import ed25519

from core.vc_verifier import EITELVCVerifier
from core.identity import NodeIdentity


@pytest.fixture
def coordinator_keys():
    """Generate coordinator Ed25519 keypair for testing."""
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    # Create JWK
    key_obj = jwk.JWK.from_pyca(public_key)
    jwk_dict = key_obj.export_public(as_dict=True)

    # Add metadata
    jwk_dict["kid"] = "test-coordinator"
    jwk_dict["use"] = "sig"

    return {
        "private_key": private_key,
        "public_key": public_key,
        "jwk_dict": jwk_dict,
    }


@pytest.fixture
def coordinator_jwk_file(coordinator_keys):
    """Write coordinator JWK to temporary file."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".jwk", delete=False) as f:
        json.dump(coordinator_keys["jwk_dict"], f)
        return f.name


@pytest.fixture
def verifier(coordinator_jwk_file):
    """Create VC verifier with coordinator key."""
    return EITELVCVerifier(coordinator_jwk_file)


class TestVCVerifierInit:
    """Test VC verifier initialization."""

    def test_init_loads_jwk_file(self, coordinator_jwk_file):
        """Verifier loads and parses JWK file."""
        verifier = EITELVCVerifier(coordinator_jwk_file)

        assert verifier.coordinator_pubkey is not None

    def test_init_missing_file_raises_error(self):
        """Raise error if JWK file doesn't exist."""
        from core.vc_verifier import VCValidationError

        with pytest.raises(VCValidationError):
            EITELVCVerifier("/nonexistent/path.jwk")


class TestVCSignatureVerification:
    """Test JWS signature verification."""

    def test_verify_valid_vc(self, verifier, coordinator_keys):
        """Valid JWS signature passes verification."""
        peer_identity = NodeIdentity.load_or_generate(Path(tempfile.gettempdir()))

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

        # Create JWS (sign with coordinator private key)
        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        # Build VC with proof
        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify
        result = verifier.verify_vc(vc, peer_identity.did)
        assert result.is_valid is True

    def test_verify_invalid_signature(self, verifier, coordinator_keys):
        """Invalid JWS signature fails verification."""
        peer_identity = NodeIdentity.load_or_generate(Path(tempfile.gettempdir()))

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

        # Create JWS with WRONG key (not coordinator)
        wrong_key = jwk.JWK.from_pyca(ed25519.Ed25519PrivateKey.generate())
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(wrong_key, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        # Build VC with invalid proof
        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify should fail
        result = verifier.verify_vc(vc, peer_identity.did)
        assert result.is_valid is False

    def test_verify_missing_proof(self, verifier):
        """VC without proof fails verification."""
        vc = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": "did:key:z6Mki...Peer"},
        }

        result = verifier.verify_vc(vc, "did:key:z6Mki...Peer")
        assert result.is_valid is False

    def test_verify_missing_jwt_in_proof(self, verifier):
        """VC with proof but no JWT fails verification."""
        vc = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": "did:key:z6Mki...Peer"},
            "proof": {"type": "JwtProof"},  # Missing "jwt" field
        }

        result = verifier.verify_vc(vc, "did:key:z6Mki...Peer")
        assert result.is_valid is False

    def test_verify_did_mismatch(self, verifier, coordinator_keys):
        """DID mismatch fails verification."""
        # Create VC for one DID
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": "did:key:z6Mki...Peer1"},
        }

        # Sign it
        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        # Build VC
        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify with DIFFERENT DID
        result = verifier.verify_vc(vc, "did:key:z6Mki...Peer2")
        assert result.is_valid is False

    def test_verify_missing_credential_subject(self, verifier, coordinator_keys):
        """VC without credentialSubject fails verification."""
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            # Missing credentialSubject
        }

        # Sign it
        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        # Build VC
        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        # Verify should fail
        result = verifier.verify_vc(vc, "did:key:z6Mki...Peer")
        assert result.is_valid is False


class TestStructuralValidation:
    """Test VC structural validation."""

    def test_verify_missing_context(self, verifier, coordinator_keys):
        """VC without @context fails."""
        vc_payload = {
            # Missing @context
            "type": ["VerifiableCredential"],
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": "did:key:z6Mki...Peer"},
        }

        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        result = verifier.verify_vc(vc, "did:key:z6Mki...Peer")
        assert result.is_valid is False

    def test_verify_missing_type(self, verifier, coordinator_keys):
        """VC without type fails."""
        vc_payload = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            # Missing type
            "issuer": "did:key:z6Mku...Coordinator",
            "credentialSubject": {"id": "did:key:z6Mki...Peer"},
        }

        key_obj = jwk.JWK.from_pyca(coordinator_keys["private_key"])
        protected_header = {"alg": "EdDSA", "typ": "JWT"}
        jws_token = jws.JWS(json.dumps(vc_payload).encode("utf-8"))
        jws_token.add_signature(key_obj, protected=json.dumps(protected_header))
        serialized_jws = jws_token.serialize(compact=True)

        vc = vc_payload.copy()
        vc["proof"] = {"type": "JwtProof", "jwt": serialized_jws}

        result = verifier.verify_vc(vc, "did:key:z6Mki...Peer")
        assert result.is_valid is False
