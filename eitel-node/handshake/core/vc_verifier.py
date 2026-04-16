"""
EITEL Verifiable Credential (VC) validation.

Validates that a VC is:
1. Structurally sound (required fields, correct types, JwtProof format)
2. Signed by the configured EITELCoordinator (JWS EdDSA signature verification)
3. Bound to the peer's claimed DID
"""

from __future__ import annotations

import json
from typing import NamedTuple

from jwcrypto import jws, jwk


class VCValidationError(Exception):
    """VC validation failed."""

    pass


class VCValidationResult(NamedTuple):
    """Result of VC validation."""

    is_valid: bool  # True if all checks passed
    error_message: str  # Empty string if valid, human-readable error otherwise


class EITELVCVerifier:
    """
    Validates EITEL Verifiable Credentials:
    - Proof format: JwtProof with JWS (EdDSA signature)
    - Signature verified against static EITELCoordinator Ed25519 public key (JWK)
    - DID binding: credential subject DID matches peer's claimed DID
    """

    def __init__(self, coordinator_pubkey_jwk_path: str):
        """
        Initialize with EITELCoordinator's Ed25519 public key (JWK format).

        Args:
            coordinator_pubkey_jwk_path: Path to JWK file with coordinator's public key

        Raises:
            VCValidationError: If JWK file cannot be loaded or parsed
        """
        try:
            with open(coordinator_pubkey_jwk_path, "r", encoding="utf-8") as f:
                key_data = json.load(f)
            self.coordinator_pubkey = jwk.JWK(**key_data)
        except Exception as e:
            raise VCValidationError(f"Failed to load coordinator JWK: {e}")

    def verify_vc(self, vc_dict: dict, peer_did: str) -> VCValidationResult:
        """
        Validate a VC.

        Args:
            vc_dict: VC as a dictionary (parsed JSON)
            peer_did: Peer's claimed DID (from handshake request)

        Returns:
            VCValidationResult(is_valid=True, error_message="") on success
            VCValidationResult(is_valid=False, error_message="...") on failure
        """
        # Step 1: Structural validation
        structural_error = self._validate_structure(vc_dict)
        if structural_error:
            return VCValidationResult(is_valid=False, error_message=structural_error)

        # Step 2: Verify JWS signature and extract signed VC body
        verify_error, signed_vc = self._verify_jws_signature(vc_dict)
        if verify_error:
            return VCValidationResult(is_valid=False, error_message=verify_error)

        # Step 3: Check DID binding (against the signed VC body)
        did_error = self._validate_did_binding(signed_vc, peer_did)
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

        # @context must be a list
        context = vc_dict.get("@context", [])
        if not isinstance(context, list):
            return "@context must be a list"

        # type must be a list containing "VerifiableCredential"
        vc_type = vc_dict.get("type", [])
        if not isinstance(vc_type, list):
            return "type must be a list"
        if "VerifiableCredential" not in vc_type:
            return "type must include VerifiableCredential"

        # credentialSubject must be a dict with id
        subject = vc_dict.get("credentialSubject", {})
        if not isinstance(subject, dict):
            return "credentialSubject must be a dict"
        if "id" not in subject:
            return "credentialSubject must have an id field"

        # proof must be a dict with type JwtProof and jwt field
        proof = vc_dict.get("proof", {})
        if not isinstance(proof, dict):
            return "proof must be a dict"
        if proof.get("type") != "JwtProof":
            return f"proof type must be JwtProof, got {proof.get('type')}"
        if "jwt" not in proof:
            return "proof must have jwt field"

        return ""

    def _verify_jws_signature(self, vc_dict: dict) -> tuple[str, dict]:
        """
        Verify the JWS signature and extract the signed VC body.

        Args:
            vc_dict: Full VC dict with proof.jwt

        Returns:
            Tuple of (error_message, signed_vc_body)
            error_message is empty on success
            signed_vc_body is the decoded JWT payload (the signed VC)
        """
        try:
            proof = vc_dict.get("proof", {})
            jwt_string = proof.get("jwt", "")

            if not jwt_string:
                return ("proof.jwt is missing", {})

            # Deserialize and verify JWS
            jws_token = jws.JWS()
            jws_token.deserialize(jwt_string)

            try:
                jws_token.verify(self.coordinator_pubkey)
            except Exception as e:
                return (f"JWS signature verification failed: {e}", {})

            # Decode payload
            payload_bytes = jws_token.payload
            signed_vc = json.loads(payload_bytes.decode("utf-8"))

            return ("", signed_vc)

        except json.JSONDecodeError as e:
            return (f"Failed to decode JWS payload: {e}", {})
        except Exception as e:
            return (f"JWS verification error: {e}", {})

    @staticmethod
    def _validate_did_binding(vc_dict: dict, peer_did: str) -> str:
        """
        Check credential subject's DID matches the peer's claimed DID.

        Args:
            vc_dict: VC dict (signed body from JWS payload)
            peer_did: Peer's claimed DID

        Returns:
            Empty string if valid, error message otherwise
        """
        subject_id = vc_dict.get("credentialSubject", {}).get("id", "")

        if subject_id != peer_did:
            return f"DID mismatch (credential: {subject_id}, request: {peer_did})"

        return ""
