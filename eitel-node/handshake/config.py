"""
Handshake service configuration via environment variables.

All settings are loaded from `.env` file or environment with `EITEL_NODE_` prefix.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """
    Handshake service configuration.

    Loaded from .env file or environment variables with EITEL_NODE_ prefix.
    """

    model_config = SettingsConfigDict(env_file=".env", env_prefix="EITEL_NODE_")

    # Node identity persistence
    node_identity_dir: str = Field(
        default="/identity",
        description="Directory path for persisting node identity (did:key + keypair)",
    )

    # Coordinator trust anchor
    coordinator_pubkey_jwk_path: str = Field(
        default="/keys/coordinator_pubkey.jwk",
        description="Path to EITELCoordinator's Ed25519 public key (JWK format)",
    )

    # EDC integration
    edc_management_url: str = Field(
        default="http://edc-control:8182",
        description="EDC management API base URL (e.g., http://edc-control:8182 or https://production-edc:8182)",
    )

    edc_dsp_endpoint: str = Field(
        default="http://localhost:11003/api/v1/dsp",
        description="EDC DSP endpoint URL (returned to peer in handshake response)",
    )

    edc_api_key: str = Field(
        default="change-me",
        description="EDC management API authentication key (x-api-key header)",
    )

    # Session tokens
    session_token_ttl: int = Field(
        default=3600,
        description="Session token TTL in seconds (default 1 hour)",
    )

    session_token_secret: str = Field(
        ...,
        description="Secret key for JWT signing (HMAC-SHA256). Must be strong. REQUIRED — no default.",
    )

    # Server
    host: str = Field(default="0.0.0.0", description="Server host address")
    port: int = Field(default=8080, description="Server port")


# Convenience function to load config
def load_config() -> Config:
    """Load configuration from environment."""
    return Config()
