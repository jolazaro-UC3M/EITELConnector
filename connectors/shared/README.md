# Connectors layout

This folder contains the separated deployment layout for the new `normal` and `star` connectors.

The current `uc3m` and `fuenlabrada` deployments remain untouched in the root compose and nginx files. Their existing routes and gateway configs are preserved.

## Structure

- `normal/`: standalone non-ArcGIS connector
- `star/`: standalone ArcGIS-enabled connector
- `star-pair/`: two Star connectors with separate private networks and a shared interconnect network
- `dual/`: both connectors together in one compose
- `shared/`: shared assets used by both connectors

## Shared assets

- `shared/nginx/nginx-connector.template.conf`: reusable gateway template for both connectors

## Star PoC notes

- `normal` and `star` no longer mount the same UI entrypoint: `normal` uses the lean `index.clean.html`, while `star` uses the Star-focused `index.final.html` with the trust banner.
- The `star` UI now exposes a persistent trust panel for coordinator, VC/DID, P2P handshake, and direct transfer states.
- The standalone `star` compose now includes a simulated coordinator on `http://localhost:12030` so the trust panel can read a public key, DID, and VC state from an actual HTTP service.
- The `dual` compose now uses a custom Docker bridge subnet (`172.29.10.0/24`) so `normal` and `star` run with distinct internal IPs, which is useful for simulating separate nodes during the proof of concept.
- `STAR_COORDINATOR_URL`, `STAR_PARTICIPANT_DID`, and `STAR_VC_PRESENT` let the UI reflect the trust material expected by the distributed `star` phase even before the final coordinator service is wired in.

## Start examples

Standalone normal:

```powershell
Copy-Item connectors/normal/.env.example connectors/normal/.env
docker compose --env-file connectors/normal/.env -f connectors/normal/docker-compose.yaml up -d --build
```

Standalone star:

```powershell
Copy-Item connectors/star/.env.example connectors/star/.env
docker compose --env-file connectors/star/.env -f connectors/star/docker-compose.yaml up -d --build
```

Star pair in separate networks:

```powershell
Copy-Item connectors/star-pair/.env.example connectors/star-pair/.env
docker compose --env-file connectors/star-pair/.env -f connectors/star-pair/docker-compose.yaml up -d --build
```

Dual mode:

```powershell
Copy-Item connectors/dual/.env.example connectors/dual/.env
docker compose --env-file connectors/dual/.env -f connectors/dual/docker-compose.yaml up -d --build
```