"""
Session token management: JWT issuance and validation for HTTP and WebSocket.
"""

from __future__ import annotations

import base58
import time
from typing import NamedTuple, Optional

import jwt
from cryptography.hazmat.primitives.asymmetric import ed25519


class InvalidTokenError(Exception):
    """Token validation failed."""

    pass


def extract_pubkey_from_did(did: str) -> bytes:
    """
    Extract Ed25519 public key from a did:key:z... identifier.

    Args:
        did: Multibase did:key identifier (e.g., "did:key:z6Mk...")

    Returns:
        Raw 32-byte Ed25519 public key

    Raises:
        ValueError: If DID format is invalid
    """
    if not did.startswith("did:key:z"):
        raise ValueError(f"Invalid DID format: {did}")

    # Extract base58btc-encoded portion after "did:key:z"
    b58_encoded = did[len("did:key:z"):]

    try:
        # Decode base58
        decoded = base58.b58decode(b58_encoded)

        # Extract multicodec prefix (0xed01 for Ed25519)
        if len(decoded) < 34 or decoded[0] != 0xed or decoded[1] != 0x01:
            raise ValueError(f"Invalid Ed25519 DID format: {did}")

        # Extract the 32-byte public key (skip multicodec prefix)
        public_key_bytes = decoded[2:34]
        return public_key_bytes
    except Exception as e:
        raise ValueError(f"Failed to extract public key from DID: {e}")



class SessionTokenClaims(NamedTuple):
    """Parsed JWT claims."""

    subject: str  # Peer DID
    audience: str  # "handshake"
    expiration: int  # Unix timestamp
    issued_at: int  # Unix timestamp
    issuer: Optional[str] = None  # This node's DID (optional)


class SessionTokenManager:
    """
    JWT issuance and validation for HTTP and WebSocket authentication.

    Uses Ed25519 for signing. Token format is standard JWT with claims:
    - sub: subject (peer DID)
    - aud: audience (gate token purpose)
    - exp: expiration timestamp
    - iat: issuance timestamp
    - iss: issuer DID (this node's DID)
    """

    def __init__(self, node_identity: NodeIdentity, ttl_seconds: int = 3600):
        """
        Initialize token manager.

        Args:
            node_identity: This node's cryptographic identity (contains Ed25519 key)
            ttl_seconds: Token TTL in seconds (default 1 hour)
        """
        self.node_identity = node_identity
        self.ttl_seconds = ttl_seconds
        # Track one-time WebSocket upgrade tickets (not persistent across restarts)
        self._used_tickets: set[str] = set()

    def issue_token(
        self, subject: str, audience: str = "handshake", issuer: Optional[str] = None
    ) -> str:
        """
        Issue a JWT session token signed with Ed25519.

        Args:
            subject: Subject (peer DID)
            audience: Audience gate (e.g., "handshake")
            issuer: Optional issuer DID (uses self.node_identity.did if not provided)

        Returns:
            JWT token string signed with Ed25519
        """
        now = int(time.time())
        payload = {
            "sub": subject,
            "aud": audience,
            "exp": now + self.ttl_seconds,
            "iat": now,
            "iss": issuer or self.node_identity.did,
        }

        # Sign with Ed25519 private key
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(
            self.node_identity.private_key_bytes
        )
        token = jwt.encode(payload, private_key, algorithm="EdDSA")
        return token

    def validate_token(self, token: str) -> SessionTokenClaims:
        """
        Decode and validate a JWT token using issuer's Ed25519 public key.

        Extracts issuer DID from token claims and verifies signature using the
        issuer's Ed25519 public key (derived from DID).

        Args:
            token: JWT token string

        Returns:
            SessionTokenClaims with parsed claims

        Raises:
            InvalidTokenError: If token is invalid, expired, or signature doesn't verify
        """
        try:
            # First, decode token WITHOUT verification to extract issuer
            unverified = jwt.decode(token, options={"verify_signature": False})
            token_issuer = unverified.get("iss")

            if not token_issuer:
                raise InvalidTokenError("Token missing issuer (iss) claim")

            # Extract public key from issuer DID
            public_key_bytes = extract_pubkey_from_did(token_issuer)

            # Recreate public key object and verify signature
            public_key = ed25519.Ed25519PublicKey.from_public_bytes(public_key_bytes)

            # PyJWT with EdDSA should work now
            payload = jwt.decode(
                token, public_key, algorithms=["EdDSA"], audience="handshake"
            )

            # Extract required claims
            subject = payload.get("sub")
            audience = payload.get("aud")
            expiration = payload.get("exp")
            issued_at = payload.get("iat")
            issuer = payload.get("iss")

            if not subject or not audience or not expiration or not issued_at:
                raise InvalidTokenError("Token missing required claims")

            # jwt.decode already checks expiration, but be explicit
            now = int(time.time())
            if expiration <= now:
                raise InvalidTokenError("Token expired")

            return SessionTokenClaims(
                subject=subject,
                audience=audience,
                expiration=expiration,
                issued_at=issued_at,
                issuer=issuer,
            )

        except jwt.DecodeError as e:
            raise InvalidTokenError(f"Token decode error: {e}")
        except jwt.ExpiredSignatureError:
            raise InvalidTokenError("Token expired")
        except Exception as e:
            raise InvalidTokenError(f"Token validation error: {e}")

    def validate_token_with_issuer_pubkey(
        self, token: str, issuer_did: Optional[str] = None
    ) -> SessionTokenClaims:
        """
        Validate a JWT token using its issuer's public key (Ed25519).

        This method is deprecated - use validate_token() instead, which now
        automatically validates using the issuer's public key.

        Args:
            token: JWT token string
            issuer_did: Optional expected issuer DID (for explicit validation)

        Returns:
            SessionTokenClaims with parsed claims

        Raises:
            InvalidTokenError: If token is invalid, signature doesn't verify, or issuer mismatch
        """
        # Just delegate to validate_token since it now handles Ed25519 verification
        claims = self.validate_token(token)

        # If expected issuer provided, verify it matches
        if issuer_did and claims.issuer != issuer_did:
            raise InvalidTokenError(
                f"Token issuer mismatch: expected {issuer_did}, got {claims.issuer}"
            )

        return claims

    def issue_ticket(self, token: str) -> str:
        """
        Issue a one-time WebSocket upgrade ticket from a valid session token.

        Args:
            token: Valid session token

        Returns:
            One-time ticket string (to be used in WebSocket ?ticket=xyz)

        Raises:
            InvalidTokenError: If token is invalid
        """
        # Validate token first
        _ = self.validate_token(token)

        # Generate ticket: base64(token_hash + timestamp)
        # Ticket is single-use and short-lived (30 seconds)
        import base64
        import hashlib

        now = int(time.time())
        ticket_payload = f"{token}:{now}".encode("utf-8")
        ticket_hash = hashlib.sha256(ticket_payload).digest()
        ticket = base64.b64encode(ticket_hash).decode("ascii")

        # Mark ticket as issued (for one-time validation later)
        self._used_tickets.add(ticket)

        return ticket

    def validate_ticket(self, ticket: str, max_age_seconds: int = 30) -> str:
        """
        Validate a WebSocket upgrade ticket and return the peer DID.

        Tickets are single-use and expire after max_age_seconds.

        Args:
            ticket: Ticket from WebSocket handshake
            max_age_seconds: Maximum age of ticket (default 30s)

        Returns:
            Peer DID if valid

        Raises:
            InvalidTokenError: If ticket is invalid or expired
        """
        # For now, tickets are marked used immediately and cannot be reused
        # In a real implementation, you'd track ticket issuance timestamps
        # and validate expiration here.

        if ticket not in self._used_tickets:
            raise InvalidTokenError("Ticket not issued or already used")

        # Remove from used set to prevent reuse
        self._used_tickets.remove(ticket)

        # TODO: Extract peer DID from ticket (currently stubbed)
        # In a real implementation, encrypt token in ticket for safe transport
        return "did:key:placeholder"
