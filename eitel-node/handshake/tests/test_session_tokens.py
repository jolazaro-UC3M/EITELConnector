"""
Tests for session token management: JWT creation and validation.
"""

import time
import tempfile
from pathlib import Path

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519

from core.identity import NodeIdentity
from core.session import SessionTokenManager, InvalidTokenError


@pytest.fixture
def node_identity():
    """Create a temporary node identity for Ed25519 token tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield NodeIdentity.load_or_generate(Path(tmpdir))


@pytest.fixture
def session_manager(node_identity):
    """Create a session token manager backed by a node identity."""
    return SessionTokenManager(node_identity=node_identity, ttl_seconds=3600)


class TestSessionTokenManager:
    """Test JWT session token creation and validation."""

    def test_issue_token_returns_string(self, session_manager):
        """Token issuance returns JWT string."""
        peer_did = "did:key:z6Mki...Peer"

        token = session_manager.issue_token(peer_did)

        assert isinstance(token, str)
        assert len(token) > 0
        # JWT format: header.payload.signature (3 parts)
        assert token.count(".") == 2

    def test_token_contains_correct_claims(self, session_manager):
        """Session token contains expected JWT claims."""
        peer_did = "did:key:z6Mki...Peer"

        token = session_manager.issue_token(peer_did, audience="handshake")

        # Decode without verification to inspect claims
        payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})

        assert payload["sub"] == peer_did
        assert payload["iss"] == session_manager.node_identity.did
        assert payload["aud"] == "handshake"
        assert "exp" in payload
        assert "iat" in payload

    def test_token_expiration_set_correctly(self, node_identity):
        """Session token expiration is set based on TTL."""
        ttl = 3600
        manager = SessionTokenManager(node_identity=node_identity, ttl_seconds=ttl)
        peer_did = "did:key:z6Mki...Peer"

        token = manager.issue_token(peer_did)
        payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})

        iat = payload["iat"]
        exp = payload["exp"]

        # exp should be iat + ttl (within 1 second tolerance)
        assert abs((exp - iat) - ttl) <= 1

    def test_validate_expired_token(self, node_identity):
        """Expired token fails validation."""
        manager = SessionTokenManager(node_identity=node_identity, ttl_seconds=-1)
        peer_did = "did:key:z6Mki...Peer"

        token = manager.issue_token(peer_did)

        with pytest.raises(InvalidTokenError):
            manager.validate_token(token)

    def test_validate_wrong_issuer_public_key(self):
        """Token signed with a mismatched issuer DID fails validation."""
        with tempfile.TemporaryDirectory() as tmpdir1, tempfile.TemporaryDirectory() as tmpdir2:
            signer_identity = NodeIdentity.load_or_generate(Path(tmpdir1))
            verifier_identity = NodeIdentity.load_or_generate(Path(tmpdir2))

            manager = SessionTokenManager(node_identity=signer_identity, ttl_seconds=3600)
            peer_did = "did:key:z6Mki...Peer"

            token = jwt.encode(
                {
                    "sub": peer_did,
                    "aud": "handshake",
                    "exp": int(time.time()) + 3600,
                    "iat": int(time.time()),
                    "iss": verifier_identity.did,
                },
                ed25519.Ed25519PrivateKey.from_private_bytes(signer_identity.private_key_bytes),
                algorithm="EdDSA",
            )

            with pytest.raises(InvalidTokenError):
                manager.validate_token(token)

    def test_validate_malformed_token(self, node_identity):
        """Malformed token fails validation."""
        manager = SessionTokenManager(node_identity=node_identity, ttl_seconds=3600)

        with pytest.raises(InvalidTokenError):
            manager.validate_token("not.a.valid.token")

    def test_validate_empty_token(self, node_identity):
        """Empty token fails validation."""
        manager = SessionTokenManager(node_identity=node_identity, ttl_seconds=3600)

        with pytest.raises(InvalidTokenError):
            manager.validate_token("")

    def test_validate_missing_required_claims(self, node_identity):
        """Token missing required claims fails validation."""
        manager = SessionTokenManager(node_identity=node_identity, ttl_seconds=3600)

        # Create token with missing 'sub' claim
        now = int(time.time())
        payload = {
            "iss": node_identity.did,
            "aud": "handshake",
            "exp": now + 3600,
            "iat": now,
        }
        token = jwt.encode(
            payload,
            ed25519.Ed25519PrivateKey.from_private_bytes(node_identity.private_key_bytes),
            algorithm="EdDSA",
        )

        with pytest.raises(InvalidTokenError):
            manager.validate_token(token)

    def test_validate_wrong_audience(self, node_identity):
        """Token with wrong audience fails validation."""
        manager = SessionTokenManager(node_identity=node_identity, ttl_seconds=3600)

        # Create token with wrong audience
        now = int(time.time())
        payload = {
            "sub": "did:key:z6Mki...Peer",
            "iss": node_identity.did,
            "aud": "wrong-audience",
            "iat": now,
            "exp": now + 3600,
        }
        token = jwt.encode(
            payload,
            ed25519.Ed25519PrivateKey.from_private_bytes(node_identity.private_key_bytes),
            algorithm="EdDSA",
        )

        with pytest.raises(InvalidTokenError):
            manager.validate_token(token)

    def test_different_nodes_produce_different_tokens(self):
        """Same input with different node identities produces different tokens."""
        with tempfile.TemporaryDirectory() as tmpdir1, tempfile.TemporaryDirectory() as tmpdir2:
            manager1 = SessionTokenManager(
                node_identity=NodeIdentity.load_or_generate(Path(tmpdir1)), ttl_seconds=3600
            )
            manager2 = SessionTokenManager(
                node_identity=NodeIdentity.load_or_generate(Path(tmpdir2)), ttl_seconds=3600
            )
            peer_did = "did:key:z6Mki...Peer"

            token1 = manager1.issue_token(peer_did)
            token2 = manager2.issue_token(peer_did)

            assert token1 != token2

    def test_token_is_valid_jwt_structure(self, session_manager):
        """Token can be decoded as valid JWT."""
        peer_did = "did:key:z6Mki...Peer"

        token = session_manager.issue_token(peer_did)

        # Should be decodable without errors
        payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
        assert payload["sub"] == peer_did
