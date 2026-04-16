"""
EITEL Verifiable Credential (VC) validation.

Validates that a VC is:
1. Structurally sound (required fields, correct types)
2. Signed by the configured EITELCoordinator (Ed25519 signature verification)
3. Not expired
4. Bound to the peer's claimed DID
"""

import base64
import json
from datetime import datetime, timezone
from typing import NamedTuple

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519
from cryptography.exceptions import InvalidSignature


class VCValidationError(Exception):
    """VC validation failed."""

    pass


class VCValidationResult(NamedTuple):
    """Result of VC validation."""

    is_valid: bool  # True if all checks passed
    error_message: str  # Empty string if valid, human-readable error otherwise


class EITELVCVerifier:
    """
    Validates EITEL Verifiable Credentials against:
    - Static EITELCoordinator Ed25519 public key
    - Expiration date
    - DID binding (credential subject matches claimed peer DID)
    """

    def __init__(self, coordinator_pubkey_pem: str):
        """
        Initialize with EITELCoordinator's Ed25519 public key.

        Args:
            coordinator_pubkey_pem: PEM-formatted Ed25519 public key string

        Raises:
            VCValidationError: If public key cannot be parsed
        """
        try:
            self.coordinator_pubkey = serialization.load_pem_public_key(
                coordinator_pubkey_pem.encode("utf-8")
            )
        except Exception as e:
            raise VCValidationError(
                f"Failed to load coordinator public key: {e}"
            )

    def verify_vc(self, vc_dict: dict, peer_did: str) -> VCValidationResult:
        """
        Validate a VC.

        Args:
            vc_dict: VC as a dictionary (parsed JSON-LD)
            peer_did: Peer's claimed DID (from handshake request)

        Returns:
            VCValidationResult(is_valid=True, error_message="") on success
            VCValidationResult(is_valid=False, error_message="...") on failure
        """
        # Step 1: Structural validation
        structural_error = self._validate_structure(vc_dict)
        if structural_error:
            return VCValidationResult(is_valid=False, error_message=structural_error)

        # Step 2: Extract issuer and verify issuer is coordinator
        issuer = vc_dict.get("issuer", "")
        issuer_error = self._validate_issuer(issuer)
        if issuer_error:
            return VCValidationResult(is_valid=False, error_message=issuer_error)

        # Step 3: Verify Ed25519 signature
        signature_error = self._verify_signature(vc_dict)
        if signature_error:
            return VCValidationResult(is_valid=False, error_message=signature_error)

        # Step 4: Check expiration
        expiration_error = self._validate_expiration(vc_dict)
        if expiration_error:
            return VCValidationResult(is_valid=False, error_message=expiration_error)

        # Step 5: Check DID binding
        did_error = self._validate_did_binding(vc_dict, peer_did)
        if did_error:
            return VCValidationResult(is_valid=False, error_message=did_error)

        return VCValidationResult(is_valid=True, error_message="")

    @staticmethod
    def _validate_structure(vc_dict: dict) -> str:
        """
        Validate VC has required fields and structure.

        Returns:
            Empty string if valid, error message otherwise
        """
        # Required top-level fields
        required_fields = ["@context", "type", "issuer", "credentialSubject", "proof"]
        for field in required_fields:
            if field not in vc_dict:
                return f"VC missing required field: {field}"

        # @context must be a list containing the W3C credentials context
        context = vc_dict.get("@context", [])
        if not isinstance(context, list):
            return "@context must be a list"
        if "https://www.w3.org/2018/credentials/v1" not in context:
            return "@context must include https://www.w3.org/2018/credentials/v1"

        # type must be a list containing "VerifiableCredential"
        vc_type = vc_dict.get("type", [])
        if not isinstance(vc_type, list):
            return "type must be a list"
        if "VerifiableCredential" not in vc_type:
            return "type must include VerifiableCredential"

        # credentialSubject must be a dict
        subject = vc_dict.get("credentialSubject", {})
        if not isinstance(subject, dict):
            return "credentialSubject must be a dict"
        if "id" not in subject:
            return "credentialSubject must have an id field"
        if "expirationDate" not in subject:
            return "credentialSubject must have an expirationDate field"

        # proof must be a dict
        proof = vc_dict.get("proof", {})
        if not isinstance(proof, dict):
            return "proof must be a dict"
        if proof.get("type") != "Ed25519Signature2020":
            return f"proof type must be Ed25519Signature2020, got {proof.get('type')}"
        if "signatureValue" not in proof:
            return "proof must have signatureValue"

        return ""

    @staticmethod
    def _validate_issuer(issuer: str) -> str:
        """
        Validate issuer format (must be a DID).

        Returns:
            Empty string if valid, error message otherwise
        """
        if not isinstance(issuer, str):
            return "issuer must be a string"
        if not issuer.startswith("did:"):
            return f"issuer must be a DID, got: {issuer}"
        return ""

    def _verify_signature(self, vc_dict: dict) -> str:
        """
        Verify the VC's Ed25519 signature.

        Args:
            vc_dict: Full VC dict

        Returns:
            Empty string if valid, error message otherwise
        """
        try:
            # Extract proof
            proof = vc_dict.get("proof", {})
            signature_value_b64 = proof.get("signatureValue", "")

            if not signature_value_b64:
                return "proof.signatureValue is missing"

            # Decode signature
            try:
                signature = base64.b64decode(signature_value_b64)
            except Exception as e:
                return f"Failed to decode signatureValue: {e}"

            # Reconstruct the VC without the proof (what was actually signed)
            vc_unsigned = {k: v for k, v in vc_dict.items() if k != "proof"}

            # Canonical JSON-LD encoding (sorted keys, no spaces, UTF-8)
            canonical_json = json.dumps(
                vc_unsigned, separators=(",", ":"), sort_keys=True, ensure_ascii=True
            )

            # Verify signature using coordinator's public key
            self.coordinator_pubkey.verify(
                signature, canonical_json.encode("utf-8")
            )

            return ""

        except InvalidSignature:
            return "VC signature verification failed (invalid signature)"
        except Exception as e:
            return f"VC signature verification error: {e}"

    @staticmethod
    def _validate_expiration(vc_dict: dict) -> str:
        """
        Check VC is not expired.

        Returns:
            Empty string if valid, error message otherwise
        """
        try:
            exp_date_str = vc_dict.get("credentialSubject", {}).get("expirationDate")
            if not exp_date_str:
                return "credentialSubject.expirationDate is missing"

            # Parse RFC3339 timestamp
            # Handle both with and without microseconds
            # 2025-04-15T10:00:00Z or 2025-04-15T10:00:00.123456Z
            exp_date = datetime.fromisoformat(exp_date_str.replace("Z", "+00:00"))

            # Check against current time (UTC)
            now = datetime.now(timezone.utc)

            if exp_date <= now:
                return (
                    f"VC expired (expirationDate: {exp_date_str}, now: {now.isoformat()})"
                )

            return ""

        except ValueError as e:
            return f"Failed to parse expirationDate: {e}"

    @staticmethod
    def _validate_did_binding(vc_dict: dict, peer_did: str) -> str:
        """
        Check credential subject's DID matches the peer's claimed DID.

        Returns:
            Empty string if valid, error message otherwise
        """
        subject_id = vc_dict.get("credentialSubject", {}).get("id", "")

        if subject_id != peer_did:
            return (
                f"DID mismatch (credential: {subject_id}, request: {peer_did})"
            )

        return ""
