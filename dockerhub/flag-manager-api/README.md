# Flag Manager API

REST API backend for the [GO Feature Flag](https://gofeatureflag.org/) Management System. Provides flag CRUD, RBAC, audit logging, approval workflows, and git-backed storage via Azure DevOps or GitLab.

Part of the **GOFF Manager** platform — see also [`neongridlabs/goff-ui`](https://hub.docker.com/r/neongridlabs/goff-ui) and [`neongridlabs/go-feature-flag`](https://hub.docker.com/r/neongridlabs/go-feature-flag).

## Quick Start

```bash
docker run -d \
  --name flag-manager-api \
  -p 8095:8095 \
  -v flags-data:/data/flags \
  -e PORT=8095 \
  -e FLAGS_DIR=/data/flags \
  neongridlabs/flag-manager-api:latest
```

The API is now available at `http://localhost:8095`. Verify with:

```bash
curl http://localhost:8095/health
# {"healthy": true}
```

## Docker Compose

The recommended way to run the full stack:

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: goff
      POSTGRES_USER: goff
      POSTGRES_PASSWORD: goff
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U goff -d goff"]
      interval: 10s
      timeout: 5s
      retries: 5

  flag-manager-api:
    image: neongridlabs/flag-manager-api:latest
    ports:
      - "8095:8095"
    volumes:
      - flags-data:/data/flags
    environment:
      PORT: "8095"
      FLAGS_DIR: /data/flags
      RELAY_PROXY_URL: http://relay-proxy:1031
      DATABASE_URL: postgres://goff:goff@postgres:5432/goff?sslmode=disable
      AUTH_ENABLED: "false"
    depends_on:
      postgres:
        condition: service_healthy

  relay-proxy:
    image: neongridlabs/go-feature-flag:latest
    ports:
      - "1031:1031"
    volumes:
      - ./relay-proxy-config.yaml:/goff/goff-proxy.yaml:ro
    depends_on:
      flag-manager-api:
        condition: service_healthy

  goff-ui:
    image: neongridlabs/goff-ui:latest
    ports:
      - "4000:4000"
    environment:
      FLAG_MANAGER_API_URL: http://flag-manager-api:8095
      NEXT_PUBLIC_FLAG_MANAGER_API_URL: http://localhost:8095
      RELAY_PROXY_URL: http://relay-proxy:1031
      NEXT_PUBLIC_RELAY_PROXY_URL: http://localhost:1031
      DEV_MODE: "true"
    depends_on:
      flag-manager-api:
        condition: service_healthy

volumes:
  pgdata:
  flags-data:
```

## Environment Variables

### Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `FLAGS_DIR` | `/data/flags` | Directory for flag YAML files (file-based storage) |
| `RELAY_PROXY_URL` | — | URL of the GO Feature Flag relay proxy for cache refresh |
| `DATABASE_URL` | — | PostgreSQL connection string. When set, enables database storage with RBAC and audit logging. When omitted, flags are stored as YAML files in `FLAGS_DIR` |

### Authentication

| Variable | Default | Description |
|---|---|---|
| `AUTH_ENABLED` | `false` | Enable JWT authentication middleware |
| `JWT_ISSUER_URL` | — | OIDC issuer URL for token validation (e.g. Keycloak realm URL) |
| `ALLOWED_ORIGINS` | — | Comma-separated CORS allowed origins |
| `ADMIN_API_KEY` | — | Static API key for service-to-service calls |

### Approval Workflows

| Variable | Default | Description |
|---|---|---|
| `REQUIRE_APPROVALS` | `false` | Require change request approval before flag modifications |
| `REQUIRE_CHANGE_NOTES` | `false` | Require notes on flag change requests |

### Git Provider — Azure DevOps

| Variable | Default | Description |
|---|---|---|
| `GIT_PROVIDER` | — | Set to `ado` to enable Azure DevOps integration |
| `ADO_ORG_URL` | — | Azure DevOps organization URL (e.g. `https://dev.azure.com/myorg`) |
| `ADO_PROJECT` | — | Azure DevOps project name |
| `ADO_REPOSITORY` | — | Azure DevOps repository name |
| `ADO_PAT` | — | Personal Access Token |
| `GIT_BASE_BRANCH` | `main` | Base branch for pull requests |
| `GIT_FLAGS_PATH` | `/flags.yaml` | Path to flags file in the repository |

### Git Provider — GitLab

| Variable | Default | Description |
|---|---|---|
| `GIT_PROVIDER` | — | Set to `gitlab` to enable GitLab integration |
| `GITLAB_URL` | — | GitLab instance URL (e.g. `https://gitlab.com`) |
| `GITLAB_PROJECT_ID` | — | GitLab project ID |
| `GITLAB_TOKEN` | — | GitLab access token |
| `GIT_BASE_BRANCH` | `main` | Base branch for merge requests |
| `GIT_FLAGS_PATH` | `/flags.yaml` | Path to flags file in the repository |

## Storage Backends

### File-based (default)

Flags are stored as YAML files in the `FLAGS_DIR` directory. Simple and portable — no external dependencies.

### PostgreSQL

Set `DATABASE_URL` to enable database storage. This unlocks:
- RBAC (role-based access control)
- Full audit logging
- Approval workflows and change requests
- API key management
- User and role management

## Volumes

| Path | Description |
|---|---|
| `/data/flags` | Persistent flag storage (file-based mode). Mount a volume here to persist flags across container restarts |

## Exposed Ports

| Port | Description |
|---|---|
| `8080` | Default HTTP port (override with `PORT` env var) |

## Health Check

```bash
curl http://localhost:8095/health
```

Returns `{"healthy": true}` when the service is ready.

Recommended Docker health check:

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:8095/health"]
  interval: 30s
  timeout: 10s
  retries: 3
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/config` | Server configuration |
| `GET` | `/api/projects` | List projects |
| `*` | `/api/projects/{project}/flags` | Flag CRUD |
| `GET` | `/api/flags/raw` | Raw flag export (used by relay proxy) |
| `*` | `/api/segments` | Audience segments |
| `*` | `/api/flagsets` | Flag sets |
| `*` | `/api/change-requests` | Approval workflows |
| `*` | `/api/audit` | Audit log |
| `*` | `/api/roles` | RBAC roles |
| `*` | `/api/users` | User management |
| `*` | `/api/api-keys` | API key management |
| `*` | `/api/notifiers` | Notification config |
| `*` | `/api/exporters` | Exporter config |
| `*` | `/api/retrievers` | Retriever config |
| `*` | `/api/integrations` | Git integration status |

## Helm Chart

Deploy to Kubernetes with the GOFF Manager Helm chart:

```bash
helm repo add goff-manager https://wspracklin.github.io/charts/
helm install goff goff-manager/goff-manager
```

See the [chart documentation](https://github.com/wspracklin/wspracklin.github.io) for all configurable values.

## Image Details

| Property | Value |
|---|---|
| Base image | `alpine:3.19` |
| Architecture | `linux/amd64` |
| User | `appuser` (UID 1000), non-root |
| Binary | Statically compiled Go |
| Shell | None (minimal attack surface) |

## Source

- [GitHub](https://github.com/wspracklin/go-ui)
- [GO Feature Flag](https://gofeatureflag.org/)

## License

See the [repository](https://github.com/wspracklin/go-ui) for license details.
