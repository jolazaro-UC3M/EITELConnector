"""
Unit tests for EDCClient - API client for the EITEL EDC connector.

Tests all methods in isolation using mocked HTTP responses.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from core.edc_client import (
    EDCClient,
    EDCCatalogueResponse,
    EDCNegotiationResponse,
    EDCTransferResponse,
)


@pytest.fixture
async def edc_client():
    """Create an EDCClient for testing."""
    client = EDCClient(
        management_url="http://localhost:8182",
        api_key="test-api-key"
    )
    yield client
    await client.close()


class TestGetCatalogue:
    """Tests for get_catalogue method."""

    @pytest.mark.asyncio
    async def test_get_catalogue_success(self):
        """Test successful catalogue query."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "asset": [
                    {"id": "asset-1", "name": "Dataset A"},
                    {"id": "asset-2", "name": "Dataset B"}
                ]
            }
        }

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            result = await client.get_catalogue("http://peer:11003/api/v1/dsp")

            assert result.error is None
            assert len(result.assets) == 2
            assert result.assets[0]["id"] == "asset-1"
            assert result.assets[1]["id"] == "asset-2"

            # Verify correct payload was sent
            mock_post.assert_called_once()
            call_args = mock_post.call_args
            payload = call_args.kwargs["json"]
            assert payload["@type"] == "CatalogRequest"
            assert payload["counterPartyAddress"] == "http://peer:11003/api/v1/dsp"
            assert payload["protocol"] == "dataspace-protocol-http"

        await client.close()

    @pytest.mark.asyncio
    async def test_get_catalogue_single_asset(self):
        """Test catalogue query with single asset (not in list)."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": {
                "asset": {"id": "asset-1", "name": "Single Asset"}
            }
        }

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            result = await client.get_catalogue("http://peer:11003/api/v1/dsp")

            assert result.error is None
            assert len(result.assets) == 1
            assert result.assets[0]["id"] == "asset-1"

        await client.close()

    @pytest.mark.asyncio
    async def test_get_catalogue_http_error(self):
        """Test catalogue query with HTTP error."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 500
        mock_response.text = "Server error"

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            result = await client.get_catalogue("http://peer:11003/api/v1/dsp")

            assert result.error is not None
            assert "500" in result.error
            assert len(result.assets) == 0

        await client.close()

    @pytest.mark.asyncio
    async def test_get_catalogue_exception(self):
        """Test catalogue query with exception."""
        client = EDCClient("http://localhost:8182", "test-key")

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.side_effect = Exception("Connection refused")
            result = await client.get_catalogue("http://peer:11003/api/v1/dsp")

            assert result.error is not None
            assert "Connection refused" in result.error
            assert len(result.assets) == 0

        await client.close()


class TestQueryNegotiations:
    """Tests for query_negotiations method."""

    @pytest.mark.asyncio
    async def test_query_negotiations_success(self):
        """Test successful negotiations query."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "data": [
                {"id": "neg-1", "state": "REQUESTED"},
                {"id": "neg-2", "state": "ACCEPTED"}
            ]
        }

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.query_negotiations("did:key:peer")

            assert len(result) == 2
            assert result[0]["id"] == "neg-1"
            assert result[1]["state"] == "ACCEPTED"

            # Verify correct URL was called
            mock_get.assert_called_once()
            call_args = mock_get.call_args
            assert "/v3/contractnegotiations" in call_args[0][0]
            assert call_args.kwargs["params"]["counterParty"] == "did:key:peer"

        await client.close()

    @pytest.mark.asyncio
    async def test_query_negotiations_empty(self):
        """Test negotiations query with no results."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": []}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.query_negotiations("did:key:peer")

            assert result == []

        await client.close()

    @pytest.mark.asyncio
    async def test_query_negotiations_error(self):
        """Test negotiations query with error."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 404

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.query_negotiations("did:key:peer")

            assert result == []

        await client.close()


class TestInitiateNegotiation:
    """Tests for initiate_negotiation method."""

    @pytest.mark.asyncio
    async def test_initiate_negotiation_success(self):
        """Test successful negotiation initiation."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "id": "neg-123",
            "state": "REQUESTED"
        }

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            result = await client.initiate_negotiation(
                counterparty_dsp_url="http://peer:11003/api/v1/dsp",
                offer_id="offer-1",
                asset_id="asset-1",
                counterparty_did="did:key:peer"
            )

            assert result.error is None
            assert result.id == "neg-123"
            assert result.state == "REQUESTED"

            # Verify payload
            call_args = mock_post.call_args
            payload = call_args.kwargs["json"]
            assert payload["@type"] == "ContractRequest"
            assert payload["policy"]["@id"] == "offer-1"
            assert payload["policy"]["target"] == "asset-1"

        await client.close()

    @pytest.mark.asyncio
    async def test_initiate_negotiation_failure(self):
        """Test negotiation initiation failure."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 400
        mock_response.text = "Invalid policy"

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            result = await client.initiate_negotiation(
                counterparty_dsp_url="http://peer:11003/api/v1/dsp",
                offer_id="offer-1",
                asset_id="asset-1",
                counterparty_did="did:key:peer"
            )

            assert result.error is not None
            assert "400" in result.error
            assert result.state == "FAILED"

        await client.close()


class TestGetNegotiation:
    """Tests for get_negotiation method."""

    @pytest.mark.asyncio
    async def test_get_negotiation_pending(self):
        """Test getting negotiation in PENDING state."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "neg-123",
            "state": "AGREED"
        }

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.get_negotiation("neg-123")

            assert result.error is None
            assert result.id == "neg-123"
            assert result.state == "AGREED"

        await client.close()

    @pytest.mark.asyncio
    async def test_get_negotiation_finalized(self):
        """Test getting negotiation in FINALIZED state with contract agreement."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "neg-123",
            "state": "FINALIZED",
            "contractAgreementId": "contract-abc"
        }

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.get_negotiation("neg-123")

            assert result.error is None
            assert result.state == "FINALIZED"
            assert result.contract_agreement_id == "contract-abc"

        await client.close()


class TestPollNegotiationState:
    """Tests for poll_negotiation_state method."""

    @pytest.mark.asyncio
    async def test_poll_negotiation_finalized_immediately(self):
        """Test polling when negotiation is already finalized."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "neg-123",
            "state": "FINALIZED",
            "contractAgreementId": "contract-abc"
        }

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await client.poll_negotiation_state("neg-123", max_retries=5, retry_delay=0.1)

            assert result.error is None
            assert result.state == "FINALIZED"
            assert result.contract_agreement_id == "contract-abc"
            # Should only call once since it's already finalized
            assert mock_get.call_count == 1

        await client.close()

    @pytest.mark.asyncio
    async def test_poll_negotiation_eventually_finalized(self):
        """Test polling when negotiation becomes finalized after retries."""
        client = EDCClient("http://localhost:8182", "test-key")

        responses = [
            MagicMock(spec=httpx.Response, status_code=200, json=lambda: {"id": "neg-123", "state": "REQUESTED"}),
            MagicMock(spec=httpx.Response, status_code=200, json=lambda: {"id": "neg-123", "state": "AGREED"}),
            MagicMock(spec=httpx.Response, status_code=200, json=lambda: {"id": "neg-123", "state": "FINALIZED", "contractAgreementId": "contract-abc"}),
        ]

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = responses

            result = await client.poll_negotiation_state("neg-123", max_retries=10, retry_delay=0.01)

            assert result.error is None
            assert result.state == "FINALIZED"
            assert result.contract_agreement_id == "contract-abc"
            assert mock_get.call_count == 3

        await client.close()

    @pytest.mark.asyncio
    async def test_poll_negotiation_timeout(self):
        """Test polling timeout when negotiation never finalizes."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "neg-123", "state": "REQUESTED"}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await client.poll_negotiation_state("neg-123", max_retries=3, retry_delay=0.01)

            assert result.error is not None
            assert "timeout" in result.error.lower()
            assert result.state == "TIMEOUT"
            assert mock_get.call_count == 3

        await client.close()


class TestStartTransfer:
    """Tests for start_transfer method."""

    @pytest.mark.asyncio
    async def test_start_transfer_success(self):
        """Test successful transfer initiation."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "id": "transfer-xyz",
            "state": "STARTED"
        }

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            result = await client.start_transfer(
                contract_id="contract-abc",
                asset_id="asset-1",
                counterparty_dsp_url="http://peer:11003/api/v1/dsp",
                destination_url="http://copyparty:3923"
            )

            assert result.error is None
            assert result.id == "transfer-xyz"
            assert result.state == "STARTED"

            # Verify payload
            call_args = mock_post.call_args
            payload = call_args.kwargs["json"]
            assert payload["@type"] == "TransferRequest"
            assert payload["contractId"] == "contract-abc"
            assert payload["assetId"] == "asset-1"
            assert payload["dataDestination"]["@type"] == "HttpData"
            assert payload["dataDestination"]["baseUrl"] == "http://copyparty:3923"

        await client.close()

    @pytest.mark.asyncio
    async def test_start_transfer_failure(self):
        """Test transfer initiation failure."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 400
        mock_response.text = "Invalid contract"

        with patch.object(client.client, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response

            result = await client.start_transfer(
                contract_id="invalid",
                asset_id="asset-1",
                counterparty_dsp_url="http://peer:11003/api/v1/dsp",
                destination_url="http://copyparty:3923"
            )

            assert result.error is not None
            assert "400" in result.error
            assert result.state == "FAILED"

        await client.close()


class TestPollTransferState:
    """Tests for poll_transfer_state method."""

    @pytest.mark.asyncio
    async def test_poll_transfer_completed_immediately(self):
        """Test polling when transfer is already completed."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "transfer-xyz",
            "state": "COMPLETED"
        }

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await client.poll_transfer_state("transfer-xyz", max_retries=10, retry_delay=0.01)

            assert result.error is None
            assert result.state == "COMPLETED"
            assert mock_get.call_count == 1

        await client.close()

    @pytest.mark.asyncio
    async def test_poll_transfer_eventually_completed(self):
        """Test polling when transfer completes after retries."""
        client = EDCClient("http://localhost:8182", "test-key")

        responses = [
            MagicMock(spec=httpx.Response, status_code=200, json=lambda: {"id": "transfer-xyz", "state": "STARTED"}),
            MagicMock(spec=httpx.Response, status_code=200, json=lambda: {"id": "transfer-xyz", "state": "IN_PROGRESS"}),
            MagicMock(spec=httpx.Response, status_code=200, json=lambda: {"id": "transfer-xyz", "state": "COMPLETED"}),
        ]

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.side_effect = responses

            result = await client.poll_transfer_state("transfer-xyz", max_retries=10, retry_delay=0.01)

            assert result.error is None
            assert result.state == "COMPLETED"
            assert mock_get.call_count == 3

        await client.close()

    @pytest.mark.asyncio
    async def test_poll_transfer_timeout(self):
        """Test polling timeout when transfer never completes."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {"id": "transfer-xyz", "state": "IN_PROGRESS"}

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response

            result = await client.poll_transfer_state("transfer-xyz", max_retries=3, retry_delay=0.01)

            assert result.error is not None
            assert "timeout" in result.error.lower()
            assert result.state == "TIMEOUT"
            assert mock_get.call_count == 3

        await client.close()


class TestGetTransfer:
    """Tests for get_transfer method."""

    @pytest.mark.asyncio
    async def test_get_transfer_in_progress(self):
        """Test getting transfer in progress."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "id": "transfer-xyz",
            "state": "IN_PROGRESS"
        }

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.get_transfer("transfer-xyz")

            assert result.error is None
            assert result.id == "transfer-xyz"
            assert result.state == "IN_PROGRESS"

        await client.close()

    @pytest.mark.asyncio
    async def test_get_transfer_not_found(self):
        """Test getting non-existent transfer."""
        client = EDCClient("http://localhost:8182", "test-key")

        mock_response = MagicMock(spec=httpx.Response)
        mock_response.status_code = 404

        with patch.object(client.client, "get", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = mock_response
            result = await client.get_transfer("nonexistent")

            assert result.error is not None
            assert "404" in result.error
            assert result.state == "FAILED"

        await client.close()
