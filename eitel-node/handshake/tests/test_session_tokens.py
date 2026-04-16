"""
Tests for session token management: JWT creation and validation.
"""

import time

import jwt
import pytest

from core.session import SessionTokenManager, InvalidTokenError


class TestSessionTokenManager:
    """Test JWT session token creation and validation."""

    def test_issue_token_returns_string(self):
        """Token issuance returns JWT string."""
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=3600)
        peer_did = "did:key:z6Mki...Peer"

        token = manager.issue_token(peer_did)

        assert isinstance(token, str)
        assert len(token) > 0
        # JWT format: header.payload.signature (3 parts)
        assert token.count(".") == 2

    def test_token_contains_correct_claims(self):
        """Session token contains expected JWT claims."""
        secret = "test-secret-key"
        manager = SessionTokenManager(secret=secret, ttl_seconds=3600)
        peer_did = "did:key:z6Mki...Peer"
        node_did = "did:key:z6Mku...Node"

        token = manager.issue_token(peer_did, audience="handshake", issuer=node_did)

        # Decode without verification to inspect claims
        payload = jwt.decode(token, secret, algorithms=["HS256"], options={"verify_aud": False})

        assert payload["sub"] == peer_did
        assert payload["iss"] == node_did
        assert payload["aud"] == "handshake"
        assert "exp" in payload
        assert "iat" in payload

    def test_token_expiration_set_correctly(self):
        """Session token expiration is set based on TTL."""
        ttl = 3600
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=ttl)
        peer_did = "did:key:z6Mki...Peer"

        token = manager.issue_token(peer_did)
        payload = jwt.decode(token, "test-secret-key", algorithms=["HS256"], options={"verify_aud": False})

        iat = payload["iat"]
        exp = payload["exp"]

        # exp should be iat + ttl (within 1 second tolerance)
        assert abs((exp - iat) - ttl) <= 1

    def test_validate_expired_token(self):
        """Expired token fails validation."""
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=-1)
        peer_did = "did:key:z6Mki...Peer"

        token = manager.issue_token(peer_did)

        with pytest.raises(InvalidTokenError):
            manager.validate_token(token)

    def test_validate_wrong_secret(self):
        """Token signed with different secret fails."""
        manager1 = SessionTokenManager(secret="secret-1", ttl_seconds=3600)
        manager2 = SessionTokenManager(secret="secret-2", ttl_seconds=3600)
        peer_did = "did:key:z6Mki...Peer"

        token = manager1.issue_token(peer_did)

        with pytest.raises(InvalidTokenError):
            manager2.validate_token(token)

    def test_validate_malformed_token(self):
        """Malformed token fails validation."""
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=3600)

        with pytest.raises(InvalidTokenError):
            manager.validate_token("not.a.valid.token")

    def test_validate_empty_token(self):
        """Empty token fails validation."""
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=3600)

        with pytest.raises(InvalidTokenError):
            manager.validate_token("")

    def test_validate_missing_required_claims(self):
        """Token missing required claims fails validation."""
        secret = "test-secret-key"
        manager = SessionTokenManager(secret=secret, ttl_seconds=3600)

        # Create token with missing 'sub' claim
        now = int(time.time())
        payload = {"iss": "did:key:z6Mku...Node", "aud": "handshake", "exp": now + 3600, "iat": now}
        token = jwt.encode(payload, secret, algorithm="HS256")

        with pytest.raises(InvalidTokenError):
            manager.validate_token(token)

    def test_validate_wrong_audience(self):
        """Token with wrong audience fails validation."""
        secret = "test-secret-key"
        manager = SessionTokenManager(secret=secret, ttl_seconds=3600)

        # Create token with wrong audience
        now = int(time.time())
        payload = {
            "sub": "did:key:z6Mki...Peer",
            "iss": "did:key:z6Mku...Node",
            "aud": "wrong-audience",
            "iat": now,
            "exp": now + 3600,
        }
        token = jwt.encode(payload, secret, algorithm="HS256")

        with pytest.raises(InvalidTokenError):
            manager.validate_token(token)

    def test_different_secrets_produce_different_tokens(self):
        """Same input with different secrets produces different tokens."""
        manager1 = SessionTokenManager(secret="secret-1", ttl_seconds=3600)
        manager2 = SessionTokenManager(secret="secret-2", ttl_seconds=3600)
        peer_did = "did:key:z6Mki...Peer"

        token1 = manager1.issue_token(peer_did)
        token2 = manager2.issue_token(peer_did)

        assert token1 != token2

    def test_token_is_valid_jwt_structure(self):
        """Token can be decoded as valid JWT."""
        manager = SessionTokenManager(secret="test-secret-key", ttl_seconds=3600)
        peer_did = "did:key:z6Mki...Peer"

        token = manager.issue_token(peer_did)

        # Should be decodable without errors
        payload = jwt.decode(token, "test-secret-key", algorithms=["HS256"], options={"verify_aud": False})
        assert payload["sub"] == peer_did
