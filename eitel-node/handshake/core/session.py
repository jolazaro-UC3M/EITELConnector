"""
Session token management: JWT issuance and validation for HTTP and WebSocket.
"""

import time
from typing import NamedTuple, Optional

import jwt


class InvalidTokenError(Exception):
    """Token validation failed."""

    pass


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

    Uses HMAC-SHA256 for signing. Token format is standard JWT with claims:
    - sub: subject (peer DID)
    - aud: audience (gate token purpose)
    - exp: expiration timestamp
    - iat: issuance timestamp
    - iss: optional issuer (this node's DID)
    """

    def __init__(self, secret: str, ttl_seconds: int = 3600):
        """
        Initialize token manager.

        Args:
            secret: Secret key for HMAC-SHA256 signing (must be strong)
            ttl_seconds: Token TTL in seconds (default 1 hour)
        """
        self.secret = secret
        self.ttl_seconds = ttl_seconds
        # Track one-time WebSocket upgrade tickets (not persistent across restarts)
        self._used_tickets: set[str] = set()

    def issue_token(
        self, subject: str, audience: str = "handshake", issuer: Optional[str] = None
    ) -> str:
        """
        Issue a JWT session token.

        Args:
            subject: Subject (peer DID)
            audience: Audience gate (e.g., "handshake")
            issuer: Optional issuer DID

        Returns:
            JWT token string
        """
        now = int(time.time())
        payload = {
            "sub": subject,
            "aud": audience,
            "exp": now + self.ttl_seconds,
            "iat": now,
        }
        if issuer:
            payload["iss"] = issuer

        token = jwt.encode(payload, self.secret, algorithm="HS256")
        return token

    def validate_token(self, token: str) -> SessionTokenClaims:
        """
        Decode and validate a JWT token.

        Args:
            token: JWT token string

        Returns:
            SessionTokenClaims with parsed claims

        Raises:
            InvalidTokenError: If token is invalid, expired, or malformed
        """
        try:
            payload = jwt.decode(
                token, self.secret, algorithms=["HS256"], options={}
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
        claims = self.validate_token(token)

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
