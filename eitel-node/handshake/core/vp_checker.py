"""
GAIA-X Verifiable Presentation (VP) best-effort validation.

Performs non-blocking, best-effort validation of GX VPs. Missing or invalid VPs
are logged as warnings and do not block the handshake. This reflects the known
PoC limitation: the full GAIA-X compliance chain is unreachable at
compliance.eiteldata.eu due to TLS chain mismatch (GitHub Pages domain).

UC3M and Fuenlabrada VPs are used as "near-production" artefacts for the PoC.
"""

from typing import NamedTuple


class VPValidationResult(NamedTuple):
    """Result of VP validation."""

    is_valid: bool  # True if all checks passed
    error_message: str  # Empty string if valid, reason otherwise


class GXVPChecker:
    """
    Best-effort GAIA-X VP validation (non-blocking if absent/invalid).

    Validates:
    1. @context includes GAIA-X namespace
    2. type includes VerifiablePresentation
    3. holder matches peer DID
    4. verifiableCredential array is present
    """

    @staticmethod
    def check_vp(vp_dict: dict, peer_did: str) -> VPValidationResult:
        """
        Perform best-effort GAIA-X VP validation.

        Args:
            vp_dict: VP as a dictionary (parsed JSON-LD)
            peer_did: Expected holder DID

        Returns:
            VPValidationResult with validation status and reason
        """
        try:
            # Check structure: @context
            context = vp_dict.get("@context", [])
            if not isinstance(context, list):
                return VPValidationResult(
                    is_valid=False, error_message="@context must be a list"
                )

            # Check for GAIA-X namespace in @context
            gx_namespaces = [
                "https://gaia-x.eu/",
                "https://www.gaia-x.eu/",
                "https://gaia-x.etsi.org/",
            ]
            has_gx_namespace = any(ns in context for ns in gx_namespaces)
            if not has_gx_namespace:
                return VPValidationResult(
                    is_valid=False,
                    error_message="@context does not include GAIA-X namespace",
                )

            # Check type: VerifiablePresentation
            vp_type = vp_dict.get("type", [])
            if not isinstance(vp_type, list):
                return VPValidationResult(
                    is_valid=False, error_message="type must be a list"
                )
            if "VerifiablePresentation" not in vp_type:
                return VPValidationResult(
                    is_valid=False,
                    error_message="type does not include VerifiablePresentation",
                )

            # Check holder matches peer DID
            holder = vp_dict.get("holder", "")
            if holder != peer_did:
                return VPValidationResult(
                    is_valid=False,
                    error_message=f"holder mismatch (holder: {holder}, peer: {peer_did})",
                )

            # Check verifiableCredential array
            credentials = vp_dict.get("verifiableCredential", [])
            if not isinstance(credentials, list) or len(credentials) == 0:
                return VPValidationResult(
                    is_valid=False,
                    error_message="verifiableCredential must be a non-empty list",
                )

            # Basic check on each credential structure
            for i, cred in enumerate(credentials):
                if not isinstance(cred, dict):
                    return VPValidationResult(
                        is_valid=False,
                        error_message=f"credential[{i}] is not a dict",
                    )
                if "type" not in cred:
                    return VPValidationResult(
                        is_valid=False,
                        error_message=f"credential[{i}] missing type",
                    )

            # All structural checks passed
            return VPValidationResult(is_valid=True, error_message="")

        except Exception as e:
            return VPValidationResult(
                is_valid=False, error_message=f"VP validation exception: {str(e)}"
            )
