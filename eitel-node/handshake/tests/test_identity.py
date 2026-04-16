"""
Tests for node identity management: keypair generation and did:key derivation.
"""

import json
import tempfile
from pathlib import Path

import base58
import pytest

from core.identity import NodeIdentity


class TestKeypairGeneration:
    """Test Ed25519 keypair generation."""

    def test_generate_keypair_returns_tuple(self):
        """Keypair generation returns (private_bytes, public_bytes)."""
        private_bytes, public_bytes = NodeIdentity.generate_keypair()

        assert isinstance(private_bytes, bytes)
        assert isinstance(public_bytes, bytes)
        assert len(private_bytes) == 32
        assert len(public_bytes) == 32

    def test_generate_keypair_is_unique(self):
        """Each generation produces different keypairs."""
        keypair1 = NodeIdentity.generate_keypair()
        keypair2 = NodeIdentity.generate_keypair()

        assert keypair1 != keypair2


class TestDidKeyDerivation:
    """Test multibase did:key derivation from Ed25519 public key."""

    def test_derive_did_key_format(self):
        """Derived DID has correct format."""
        _, public_bytes = NodeIdentity.generate_keypair()
        did = NodeIdentity.derive_did_key(public_bytes)

        assert did.startswith("did:key:z")
        assert len(did) > 10

    def test_derive_did_key_multibase_encoding(self):
        """Derived DID uses base58btc (z prefix)."""
        _, public_bytes = NodeIdentity.generate_keypair()
        did = NodeIdentity.derive_did_key(public_bytes)

        # Extract the base58 part (after "did:key:z")
        base58_part = did[9:]  # len("did:key:z") = 9

        # Should be valid base58 (no decoding errors)
        decoded = base58.b58decode(base58_part)

        # First 2 bytes should be multicodec (0xed, 0x01)
        assert decoded[0] == 0xed
        assert decoded[1] == 0x01
        # Remaining 32 bytes should be the public key
        assert decoded[2:] == public_bytes

    def test_derive_did_key_deterministic(self):
        """Same public key always produces same DID."""
        _, public_bytes = NodeIdentity.generate_keypair()
        did1 = NodeIdentity.derive_did_key(public_bytes)
        did2 = NodeIdentity.derive_did_key(public_bytes)

        assert did1 == did2


class TestNodeIdentity:
    """Test NodeIdentity creation and persistence."""

    def test_node_identity_namedtuple_fields(self):
        """NodeIdentity has correct fields."""
        private_bytes, public_bytes = NodeIdentity.generate_keypair()
        did = NodeIdentity.derive_did_key(public_bytes)
        identity = NodeIdentity(
            private_key_bytes=private_bytes,
            public_key_bytes=public_bytes,
            did=did,
        )

        assert identity.private_key_bytes == private_bytes
        assert identity.public_key_bytes == public_bytes
        assert identity.did == did

    def test_sign_payload(self):
        """Node can sign payloads with Ed25519."""
        private_bytes, public_bytes = NodeIdentity.generate_keypair()
        did = NodeIdentity.derive_did_key(public_bytes)
        identity = NodeIdentity(
            private_key_bytes=private_bytes,
            public_key_bytes=public_bytes,
            did=did,
        )

        payload = {"test": "data", "number": 42}
        signature = identity.sign_payload(payload)

        # Signature should be base64-encoded
        assert isinstance(signature, str)
        assert len(signature) > 0


class TestLoadOrGenerate:
    """Test loading or generating node identity from disk."""

    def test_generate_new_identity(self):
        """Generate new identity when file doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            identity = NodeIdentity.load_or_generate(Path(tmpdir))

            assert identity.did.startswith("did:key:z")
            assert len(identity.private_key_bytes) == 32
            assert len(identity.public_key_bytes) == 32

    def test_persist_identity_to_disk(self):
        """Generated identity is persisted to node.json."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            identity1 = NodeIdentity.load_or_generate(tmpdir_path)

            # node.json should exist
            node_file = tmpdir_path / "node.json"
            assert node_file.exists()

            # Should contain base58-encoded keys
            with open(node_file, "r") as f:
                data = json.load(f)
            assert "private_key_b58" in data
            assert "public_key_b58" in data
            assert "did" in data

    def test_load_existing_identity(self):
        """Load existing identity from disk."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)

            # Generate and persist
            identity1 = NodeIdentity.load_or_generate(tmpdir_path)

            # Load from same directory
            identity2 = NodeIdentity.load_or_generate(tmpdir_path)

            assert identity1.did == identity2.did
            assert identity1.private_key_bytes == identity2.private_key_bytes
            assert identity1.public_key_bytes == identity2.public_key_bytes

    def test_prevent_silent_regeneration(self):
        """Raise error if identity missing and allow_generate=False."""
        with tempfile.TemporaryDirectory() as tmpdir:
            with pytest.raises(RuntimeError, match="identity not found"):
                NodeIdentity.load_or_generate(Path(tmpdir), allow_generate=False)

    def test_base58_roundtrip(self):
        """Keys survive base58 encode/decode roundtrip."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmpdir_path = Path(tmpdir)
            identity1 = NodeIdentity.load_or_generate(tmpdir_path)

            # Reload and verify keys match
            identity2 = NodeIdentity.load_or_generate(tmpdir_path)

            assert identity1.private_key_bytes == identity2.private_key_bytes
            assert identity1.public_key_bytes == identity2.public_key_bytes
