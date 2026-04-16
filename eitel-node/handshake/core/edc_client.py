"""
EDC management API client: proxy for querying catalogue and negotiation endpoints.

This is a minimal client focused on the PoC. It proxies requests to EDC's
management API without pre-registering peers (EDC handles peer identity at
DSP negotiation time, not before).
"""

from typing import Optional, NamedTuple
import httpx


class EDCCatalogueResponse(NamedTuple):
    """Response from EDC catalogue query."""

    assets: list[dict]  # List of asset dicts
    error: Optional[str] = None  # Error message if query failed


class EDCClient:
    """
    HTTP client for calling EDC management API endpoints.

    Focused on PoC: only implements catalogue query. Negotiation endpoints are stubs.
    """

    def __init__(self, management_url: str, api_key: str):
        """
        Initialize EDC client.

        Args:
            management_url: Base URL of EDC management API
                (e.g., "http://edc-control:8182" or "https://production-edc:8182")
            api_key: API key for x-api-key authentication header
        """
        self.management_url = management_url.rstrip("/")
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=10.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()

    async def get_catalogue(self) -> EDCCatalogueResponse:
        """
        Query this node's asset catalogue via EDC management API.

        Calls: POST /v3/catalog/request (EDC's catalogue endpoint)

        Returns:
            EDCCatalogueResponse with assets list or error
        """
        try:
            url = f"{self.management_url}/v3/catalog/request"

            # Minimal catalogue query payload
            # (This is a stub; actual payload depends on EDC API version)
            payload = {}

            headers = {"x-api-key": self.api_key, "Content-Type": "application/json"}

            response = await self.client.post(url, json=payload, headers=headers)

            if response.status_code != 200:
                error = f"EDC catalogue query failed: {response.status_code}"
                return EDCCatalogueResponse(assets=[], error=error)

            data = response.json()
            # EDC returns assets in various formats; extract what we can
            assets = data.get("data", {}).get("asset", [])
            if not isinstance(assets, list):
                assets = [assets] if assets else []

            return EDCCatalogueResponse(assets=assets, error=None)

        except Exception as e:
            error = f"EDC catalogue query error: {str(e)}"
            return EDCCatalogueResponse(assets=[], error=error)

    async def query_negotiations(self, counterparty_did: str) -> list[dict]:
        """
        Query contract negotiations with a specific counterparty.

        Args:
            counterparty_did: Peer's DID

        Returns:
            List of negotiation records (empty on error)

        Note:
            TODO: Implement after EDC integration testing.
            Endpoint: GET /v3/contractnegotiations?counterParty=...
        """
        # Stub: not implemented in PoC
        return []

    async def initiate_negotiation(
        self, counterparty_did: str, asset_id: str
    ) -> dict:
        """
        Initiate DSP contract negotiation with a peer for an asset.

        Args:
            counterparty_did: Peer's DID
            asset_id: Asset to negotiate access to

        Returns:
            Negotiation initiation response or error dict

        Note:
            TODO: Implement after EDC integration testing.
            Endpoint: POST /v3/contractnegotiations/initiate
            Payload: {
                "counterPartyAddress": "...",
                "protocol": "dataspace-protocol-http",
                "connectorId": "...",
                "offer": {
                    "offerId": "...",
                    "assetId": asset_id,
                    "policy": {...}
                }
            }
        """
        # Stub: not implemented in PoC
        return {
            "error": "initiate_negotiation not yet implemented",
            "reason": "TODO: EDC integration testing",
        }
