# EITELConnector

Repositorio principal del ecosistema EITEL para desplegar y operar conectores basados en Eclipse EDC, junto con la UI de administración, servicios auxiliares y plantillas de despliegue.

## Qué contiene

- Runtime EDC empaquetado para despliegue con Docker.
- UI web EITEL para gestión de assets, policies, contracts y transfers.
- Servicio `local-assets` para subida y publicación de ficheros locales.
- Servicio `download-sink` para recepcionar descargas y transferencias.
- Control plane `CAAS` para escenarios de Connector-as-a-Service.
- Despliegues productivos existentes para `uc3m` y `fuenlabrada`.
- Estructura separada para conectores `normal` y `star` en `connectors/`.

## Estado actual de despliegues

Los despliegues productivos actuales del proyecto son:

- `uc3m`: [docker-compose.production.yaml](docker-compose.production.yaml)
- `fuenlabrada`: [docker-compose.fuenlabrada.production.yaml](docker-compose.fuenlabrada.production.yaml)

Sus configuraciones nginx y scripts de inicialización siguen en:

- [traefik/nginx-uc3m.conf](traefik/nginx-uc3m.conf)
- [traefik/nginx-fuenlabrada.conf](traefik/nginx-fuenlabrada.conf)
- [deploy/aws/init-conectoruc3m.sql](deploy/aws/init-conectoruc3m.sql)
- [deploy/aws/init-conectorfuenlabrada.sql](deploy/aws/init-conectorfuenlabrada.sql)

Además, existe una estructura adicional en [connectors](connectors) para despliegues separados de nuevos conectores:

- `normal`: sin ArcGIS
- `star`: con ArcGIS
- `dual`: ambos a la vez

Esta estructura no sustituye por sí sola a `uc3m` ni a `fuenlabrada`.

## Estructura principal

- [caas](caas): control plane, generación de planes y utilidades CAAS.
- [caas/control-plane](caas/control-plane): API FastAPI para `local-assets` y utilidades de publicación.
- [caas/download-sink](caas/download-sink): servicio receptor de descargas.
- [caas/edc-ui](caas/edc-ui): frontend EITEL servido con nginx.
- [deploy](deploy): Dockerfile del runtime y documentación de despliegue.
- [deploy/aws](deploy/aws): scripts SQL y guías de despliegue en AWS.
- [traefik](traefik): configuraciones nginx/gateway para los conectores.
- [connectors](connectors): despliegues separados `normal` y `star`.

## Requisitos

- Docker Engine
- Docker Compose plugin
- Git

Para desarrollo local también puede ser útil:

- Python 3.11+
- entorno virtual local `.venv`

## Arranque rápido local

Para levantar el stack local base del conector UC3M:

```powershell
docker compose -f docker-compose.yaml up -d --build
```

Este compose es útil para pruebas locales y usa:

- runtime EDC
- PostgreSQL
- UI EITEL
- `local-assets`
- gateway nginx

## Despliegue en producción

### UC3M

```powershell
Copy-Item .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.production.yaml up -d --build
```

Documentación relacionada:

- [deploy/aws/PRODUCTION_DEPLOY.md](deploy/aws/PRODUCTION_DEPLOY.md)
- [deploy/aws/PRODUCTION_DEPLOY_WINDOWS.md](deploy/aws/PRODUCTION_DEPLOY_WINDOWS.md)

### Fuenlabrada

```powershell
Copy-Item .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.fuenlabrada.production.yaml up -d --build
```

Importante:

- si cambian variables ArcGIS de la UI, conviene recrear el contenedor UI
- no ejecutar `docker compose down -v` en producción
- no borrar los volúmenes PostgreSQL asociados si se quiere preservar estado

## Conectores separados `normal` y `star`

La estructura separada vive en [connectors](connectors) y está pensada para nuevos despliegues independientes.

Ejemplos:

```powershell
Copy-Item connectors/normal/.env.example connectors/normal/.env
docker compose --env-file connectors/normal/.env -f connectors/normal/docker-compose.yaml up -d --build
```

```powershell
Copy-Item connectors/star/.env.example connectors/star/.env
docker compose --env-file connectors/star/.env -f connectors/star/docker-compose.yaml up -d --build
```

```powershell
Copy-Item connectors/dual/.env.example connectors/dual/.env
docker compose --env-file connectors/dual/.env -f connectors/dual/docker-compose.yaml up -d --build
```

Más detalle en [connectors/shared/README.md](connectors/shared/README.md).

## CAAS

El módulo CAAS permite gestionar planes y generación de despliegues para conectores tipo servicio.

Más información en [caas/README.md](caas/README.md).

## Gestión de configuración y secretos

- Los valores reales de secretos no deben guardarse en el repositorio.
- Usa siempre archivos ejemplo como base:
  - [.env.production.example](.env.production.example)
  - [connectors/normal/.env.example](connectors/normal/.env.example)
  - [connectors/star/.env.example](connectors/star/.env.example)
  - [connectors/dual/.env.example](connectors/dual/.env.example)
- Sustituye placeholders antes de desplegar.

## Persistencia y datos sensibles

Los datos persistentes del conector pueden incluir:

- contratos
- negociaciones
- transferencias
- assets locales subidos

Por eso:

- no borres volúmenes de producción sin intención explícita
- no publiques `.env` reales
- no subas bases de datos locales ni ficheros generados en pruebas

## Notas útiles

- `uc3m` y `fuenlabrada` están pensados para despliegues separados.
- Ambos compose productivos publican `12000:80`, por lo que no deben levantarse juntos en la misma máquina salvo adaptación previa.
- La UI EITEL toma parte de su configuración en tiempo de arranque desde variables de entorno.
