"""
EDC management API client: proxy for querying catalogue, negotiation, and transfer endpoints.

This client orchestrates the full contract negotiation and data transfer flow with the EITEL EDC connector.
It treats EDC as an immutable external dependency and only calls its management API.
"""

from __future__ import annotations

import asyncio
from typing import Optional, NamedTuple
import httpx


class EDCCatalogueResponse(NamedTuple):
    """Response from EDC catalogue query."""

    assets: list[dict]
    provider_id: str = ""
    error: Optional[str] = None


class EDCNegotiationResponse(NamedTuple):
    """Response from EDC negotiation query."""

    id: str
    state: str
    contract_agreement_id: Optional[str] = None
    error: Optional[str] = None


class EDCTransferResponse(NamedTuple):
    """Response from EDC transfer initiation."""

    id: str
    state: str
    error: Optional[str] = None


class EDCClient:
    """HTTP client for EDC management API endpoints."""

    def __init__(self, management_url: str, api_key: str):
        """
        Initialize EDC client.

        Args:
            management_url: Base URL of EDC management API
            api_key: API key for x-api-key authentication header
        """
        self.management_url = management_url.rstrip("/")
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self.client.aclose()

    def _headers(self) -> dict:
        """Return standard headers for EDC API calls."""
        return {
            "x-api-key": self.api_key,
            "Content-Type": "application/json"
        }

    async def get_catalogue(self, counterparty_dsp_url: str, counterparty_did: Optional[str] = None) -> EDCCatalogueResponse:
        """
        Query catalogue from a peer node via DSP.

        Calls: POST /v3/catalog/request

        Args:
            counterparty_dsp_url: Peer's DSP endpoint URL
            counterparty_did: Peer's DID (required for EDC v0.16.0+)

        Returns:
            EDCCatalogueResponse with assets list or error
        """
        try:
            url = f"{self.management_url}/v3/catalog/request"

            payload = {
                "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
                "@type": "CatalogRequest",
                "counterPartyAddress": counterparty_dsp_url,
                "protocol": "dataspace-protocol-http"
            }

            if counterparty_did:
                payload["counterPartyId"] = counterparty_did

            response = await self.client.post(url, json=payload, headers=self._headers())

            if response.status_code != 200:
                error = f"EDC catalogue query failed: {response.status_code} - {response.text}"
                return EDCCatalogueResponse(assets=[], provider_id="", error=error)

            data = response.json()
            provider_id = data.get("@id", "")

            # EDC v0.2.x returns DCAT JSON-LD with "dcat:dataset" key
            datasets = data.get("dcat:dataset") or []
            if isinstance(datasets, dict):
                datasets = [datasets]

            assets = []
            for ds in datasets:
                policy = ds.get("odrl:hasPolicy") or {}
                if isinstance(policy, list):
                    policy = policy[0] if policy else {}
                assets.append({
                    "id": ds.get("@id", ""),
                    "offer_id": policy.get("@id", ds.get("@id", "")),
                })

            return EDCCatalogueResponse(assets=assets, provider_id=provider_id, error=None)

        except Exception as e:
            error = f"EDC catalogue query error: {str(e)}"
            return EDCCatalogueResponse(assets=[], provider_id="", error=error)

    async def query_negotiations(self, counterparty_did: str) -> list[dict]:
        """
        Query contract negotiations with a specific counterparty.

        Calls: GET /v3/contractnegotiations?counterParty={counterparty_did}

        Args:
            counterparty_did: Peer's DID

        Returns:
            List of negotiation records or empty list on error
        """
        try:
            url = f"{self.management_url}/v3/contractnegotiations"
            params = {"counterParty": counterparty_did}

            response = await self.client.get(url, params=params, headers=self._headers())

            if response.status_code != 200:
                return []

            data = response.json()
            negotiations = data.get("data", [])
            if not isinstance(negotiations, list):
                negotiations = []

            return negotiations

        except Exception:
            return []

    async def initiate_negotiation(
        self,
        counterparty_dsp_url: str,
        offer_id: str,
        asset_id: str,
        counterparty_did: str,
        policy: Optional[dict] = None
    ) -> EDCNegotiationResponse:
        """
        Initiate DSP contract negotiation for an asset.

        Calls: POST /v3/contractnegotiations/initiate

        Args:
            counterparty_dsp_url: Peer's DSP endpoint
            offer_id: Asset offer ID from catalogue
            asset_id: Asset ID being negotiated
            counterparty_did: Peer's DID
            policy: Optional policy dict (defaults to empty for PoC)

        Returns:
            EDCNegotiationResponse with negotiation ID and state
        """
        try:
            url = f"{self.management_url}/v3/contractnegotiations/initiate"

            payload = {
                "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
                "@type": "ContractRequest",
                "counterPartyAddress": counterparty_dsp_url,
                "protocol": "dataspace-protocol-http",
                "policy": {
                    "@type": "Offer",
                    "@id": offer_id,
                    "assigner": counterparty_did,
                    "target": asset_id,
                    **(policy or {})
                }
            }

            response = await self.client.post(url, json=payload, headers=self._headers())

            if response.status_code not in (200, 201):
                error = f"Failed to initiate negotiation: {response.status_code} - {response.text}"
                return EDCNegotiationResponse(id="", state="FAILED", error=error)

            data = response.json()
            negotiation_id = data.get("id", "")
            state = data.get("state", "REQUESTED")

            return EDCNegotiationResponse(
                id=negotiation_id,
                state=state,
                error=None
            )

        except Exception as e:
            error = f"EDC initiate negotiation error: {str(e)}"
            return EDCNegotiationResponse(id="", state="FAILED", error=error)

    async def get_negotiation(self, negotiation_id: str) -> EDCNegotiationResponse:
        """
        Get current state of a contract negotiation.

        Calls: GET /v3/contractnegotiations/{negotiation_id}

        Args:
            negotiation_id: EDC negotiation ID

        Returns:
            EDCNegotiationResponse with negotiation details
        """
        try:
            url = f"{self.management_url}/v3/contractnegotiations/{negotiation_id}"

            response = await self.client.get(url, headers=self._headers())

            if response.status_code != 200:
                error = f"Failed to get negotiation: {response.status_code}"
                return EDCNegotiationResponse(id=negotiation_id, state="FAILED", error=error)

            data = response.json()
            state = data.get("state", "UNKNOWN")
            contract_agreement_id = data.get("contractAgreementId")

            return EDCNegotiationResponse(
                id=negotiation_id,
                state=state,
                contract_agreement_id=contract_agreement_id,
                error=None
            )

        except Exception as e:
            error = f"EDC get negotiation error: {str(e)}"
            return EDCNegotiationResponse(id=negotiation_id, state="FAILED", error=error)

    async def poll_negotiation_state(
        self,
        negotiation_id: str,
        max_retries: int = 30,
        retry_delay: float = 1.0
    ) -> EDCNegotiationResponse:
        """
        Poll negotiation state until FINALIZED or error.

        Args:
            negotiation_id: EDC negotiation ID
            max_retries: Maximum number of poll attempts
            retry_delay: Delay between retries in seconds

        Returns:
            EDCNegotiationResponse with final state and contract agreement ID
        """
        for attempt in range(max_retries):
            result = await self.get_negotiation(negotiation_id)

            if result.error:
                return result

            if result.state in ("FINALIZED", "TERMINATED", "FAILED"):
                return result

            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)

        error = f"Negotiation polling timeout after {max_retries} retries"
        return EDCNegotiationResponse(id=negotiation_id, state="TIMEOUT", error=error)

    async def start_transfer(
        self,
        contract_id: str,
        asset_id: str,
        counterparty_dsp_url: str,
        destination_url: str
    ) -> EDCTransferResponse:
        """
        Start a data transfer after contract negotiation.

        Calls: POST /v3/transferprocesses

        Args:
            contract_id: Contract agreement ID from negotiation
            asset_id: Asset being transferred
            counterparty_dsp_url: Peer's DSP endpoint
            destination_url: HTTP endpoint to receive data (copyparty URL)

        Returns:
            EDCTransferResponse with transfer process ID and initial state
        """
        try:
            url = f"{self.management_url}/v3/transferprocesses"

            payload = {
                "@context": {"@vocab": "https://w3id.org/edc/v0.0.1/ns/"},
                "@type": "TransferRequest",
                "contractId": contract_id,
                "counterPartyAddress": counterparty_dsp_url,
                "assetId": asset_id,
                "protocol": "dataspace-protocol-http",
                "dataDestination": {
                    "@type": "HttpData",
                    "baseUrl": destination_url
                }
            }

            response = await self.client.post(url, json=payload, headers=self._headers())

            if response.status_code not in (200, 201):
                error = f"Failed to start transfer: {response.status_code} - {response.text}"
                return EDCTransferResponse(id="", state="FAILED", error=error)

            data = response.json()
            transfer_id = data.get("id", "")
            state = data.get("state", "STARTED")

            return EDCTransferResponse(
                id=transfer_id,
                state=state,
                error=None
            )

        except Exception as e:
            error = f"EDC start transfer error: {str(e)}"
            return EDCTransferResponse(id="", state="FAILED", error=error)

    async def poll_transfer_state(
        self,
        transfer_id: str,
        max_retries: int = 60,
        retry_delay: float = 1.0
    ) -> EDCTransferResponse:
        """
        Poll transfer state until COMPLETED or error.

        Args:
            transfer_id: EDC transfer process ID
            max_retries: Maximum number of poll attempts
            retry_delay: Delay between retries in seconds

        Returns:
            EDCTransferResponse with final state
        """
        for attempt in range(max_retries):
            result = await self.get_transfer(transfer_id)

            if result.error:
                return result

            if result.state in ("COMPLETED", "TERMINATED", "FAILED", "ERROR"):
                return result

            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)

        error = f"Transfer polling timeout after {max_retries} retries"
        return EDCTransferResponse(id=transfer_id, state="TIMEOUT", error=error)

    async def get_transfer(self, transfer_id: str) -> EDCTransferResponse:
        """
        Get current state of a transfer process.

        Calls: GET /v3/transferprocesses/{transfer_id}

        Args:
            transfer_id: EDC transfer process ID

        Returns:
            EDCTransferResponse with transfer state
        """
        try:
            url = f"{self.management_url}/v3/transferprocesses/{transfer_id}"

            response = await self.client.get(url, headers=self._headers())

            if response.status_code != 200:
                error = f"Failed to get transfer: {response.status_code}"
                return EDCTransferResponse(id=transfer_id, state="FAILED", error=error)

            data = response.json()
            state = data.get("state", "UNKNOWN")

            return EDCTransferResponse(
                id=transfer_id,
                state=state,
                error=None
            )

        except Exception as e:
            error = f"EDC get transfer error: {str(e)}"
            return EDCTransferResponse(id=transfer_id, state="FAILED", error=error)
