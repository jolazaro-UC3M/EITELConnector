from __future__ import annotations

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')

    coordinator_name: str = 'UC3M Coordinador EITEL'
    coordinator_url: str = 'http://localhost:12030'
    public_key_id: str = 'uc3m-star-demo-key'
    public_key_pem: str = '-----BEGIN PUBLIC KEY-----\nSTAR-DEMO-PUBLIC-KEY\n-----END PUBLIC KEY-----'
    default_participant_id: str = 'conectorstar'
    default_participant_did: str = 'did:key:pending-conectorstar'
    default_vc_present: bool = True
    default_vc_issuer: str = 'UC3M'
    default_vc_id: str = 'urn:star:vc:conectorstar'
    default_vc_status: str = 'simulated'


settings = Settings()
app = FastAPI(title='Star Coordinator Simulator', version='0.1.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


class PublicKeyPayload(BaseModel):
    id: str
    type: str = 'Ed25519'
    algorithm: str = 'EdDSA'
    publicKeyPem: str
    published: bool = True


class CredentialPayload(BaseModel):
    present: bool
    issuer: str
    id: str
    status: str


class ParticipantPayload(BaseModel):
    id: str
    did: str
    vc: CredentialPayload
    verificationMode: str = 'simulated'


class CoordinatorStatusPayload(BaseModel):
    coordinator: dict
    participant: ParticipantPayload


def build_participant(participant: str | None = None) -> ParticipantPayload:
    participant_id = (participant or settings.default_participant_id).strip() or settings.default_participant_id
    did_value = settings.default_participant_did.replace('conectorstar', participant_id)
    vc_id = settings.default_vc_id.replace('conectorstar', participant_id)
    return ParticipantPayload(
        id=participant_id,
        did=did_value,
        vc=CredentialPayload(
            present=bool(settings.default_vc_present),
            issuer=settings.default_vc_issuer,
            id=vc_id,
            status=settings.default_vc_status,
        ),
    )


@app.get('/health')
def health() -> dict:
    return {'status': 'ok'}


@app.get('/api/star/public-key', response_model=PublicKeyPayload)
def public_key() -> PublicKeyPayload:
    return PublicKeyPayload(id=settings.public_key_id, publicKeyPem=settings.public_key_pem)


@app.get('/api/star/status', response_model=CoordinatorStatusPayload)
def status(participant: str | None = Query(default=None)) -> CoordinatorStatusPayload:
    participant_payload = build_participant(participant)
    return CoordinatorStatusPayload(
        coordinator={
            'name': settings.coordinator_name,
            'url': settings.coordinator_url,
            'publicKey': PublicKeyPayload(id=settings.public_key_id, publicKeyPem=settings.public_key_pem).model_dump(),
            'issuanceMode': 'simulated-once',
        },
        participant=participant_payload,
    )


@app.get('/api/star/participants/{participant_id}', response_model=ParticipantPayload)
def participant_status(participant_id: str) -> ParticipantPayload:
    return build_participant(participant_id)