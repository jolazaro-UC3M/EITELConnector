"""
Node identity management: did:key generation, persistence, and signing.

Each node generates an Ed25519 keypair on first start, derives a multibase did:key,
and persists both to a JSON file in a mounted volume. On subsequent starts, the
existing keypair is loaded.
"""

import base58
import json
from pathlib import Path
from typing import NamedTuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519


class NodeIdentity(NamedTuple):
    """Node's cryptographic identity (Ed25519 keypair + derived did:key)."""

    private_key_bytes: bytes  # Raw Ed25519 private key (32 bytes)
    public_key_bytes: bytes  # Raw Ed25519 public key (32 bytes)
    did: str  # Derived multibase did:key (e.g., "did:key:z6Mki...")

    def sign_payload(self, payload: dict) -> str:
        """
        Sign a JSON payload with this node's private key.

        Args:
            payload: Dict to sign (will be JSON-encoded canonically)

        Returns:
            Base64-encoded Ed25519 signature
        """
        import base64
        private_key = ed25519.Ed25519PrivateKey.from_private_bytes(
            self.private_key_bytes
        )
        # Canonical JSON-LD encoding (sorted keys, no spaces)
        canonical_json = json.dumps(
            payload, separators=(",", ":"), sort_keys=True, ensure_ascii=True
        )
        signature = private_key.sign(canonical_json.encode("utf-8"))
        return base64.b64encode(signature).decode("ascii")

    @staticmethod
    def generate_keypair() -> tuple[bytes, bytes]:
        """
        Generate a new Ed25519 keypair.

        Returns:
            (private_key_bytes, public_key_bytes) — both raw 32-byte format
        """
        private_key = ed25519.Ed25519PrivateKey.generate()
        private_bytes = private_key.private_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PrivateFormat.Raw,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        return private_bytes, public_bytes

    @staticmethod
    def derive_did_key(public_key_bytes: bytes) -> str:
        """
        Derive a multibase did:key from an Ed25519 public key.

        Uses base58btc encoding (multibase prefix 'z').

        Args:
            public_key_bytes: Raw 32-byte Ed25519 public key

        Returns:
            did:key:z... format string
        """
        # Ed25519 public key multicodec: 0xed (1 byte) + 0x01 (1 byte) = 0xed01
        multicodec_prefix = bytes([0xed, 0x01])
        key_with_multicodec = multicodec_prefix + public_key_bytes

        # Base58btc encoding (multibase 'z' prefix)
        return "did:key:z" + base58.b58encode(key_with_multicodec).decode("ascii")

    @classmethod
    def load_or_generate(cls, identity_dir: Path, allow_generate: bool = True) -> "NodeIdentity":
        """
        Load existing node identity from disk, or generate and persist a new one.

        Args:
            identity_dir: Path to directory where identity.json is stored
            allow_generate: If False, raise error if identity doesn't exist (prevent silent key regeneration)

        Returns:
            NodeIdentity instance (loaded or newly generated)

        Raises:
            RuntimeError: If identity not found and allow_generate=False
        """
        identity_dir = Path(identity_dir)
        identity_dir.mkdir(parents=True, exist_ok=True)
        identity_file = identity_dir / "node.json"

        # Try to load existing identity
        if identity_file.exists():
            try:
                with open(identity_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                private_bytes = base58.b58decode(data["private_key_b58"])
                public_bytes = base58.b58decode(data["public_key_b58"])
                did = data["did"]
                return cls(
                    private_key_bytes=private_bytes,
                    public_key_bytes=public_bytes,
                    did=did,
                )
            except (json.JSONDecodeError, KeyError, ValueError) as e:
                raise RuntimeError(
                    f"Failed to load identity from {identity_file}: {e}"
                )

        # Key generation
        if not allow_generate:
            raise RuntimeError(
                f"Node identity not found at {identity_file} and key generation is disabled. "
                "Run registration first to generate a new identity."
            )

        print(
            "WARNING: Generating new node identity. Any previously issued VC will be invalid."
        )

        # Generate new identity
        private_bytes, public_bytes = cls.generate_keypair()
        did = cls.derive_did_key(public_bytes)
        identity = cls(
            private_key_bytes=private_bytes,
            public_key_bytes=public_bytes,
            did=did,
        )

        # Persist to disk
        with open(identity_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "private_key_b58": base58.b58encode(private_bytes).decode("ascii"),
                    "public_key_b58": base58.b58encode(public_bytes).decode("ascii"),
                    "did": did,
                },
                f,
                indent=2,
            )

        return identity
