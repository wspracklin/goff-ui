# GOFF UI

Web-based management console for the [GO Feature Flag](https://gofeatureflag.org/) Management System. Built with Next.js 16, React 19, and Tailwind CSS.

Part of the **GOFF Manager** platform — see also [`neongridlabs/flag-manager-api`](https://hub.docker.com/r/neongridlabs/flag-manager-api) and [`neongridlabs/go-feature-flag`](https://hub.docker.com/r/neongridlabs/go-feature-flag).

## Quick Start

```bash
docker run -d \
  --name goff-ui \
  -p 4000:4000 \
  -e FLAG_MANAGER_API_URL=http://flag-manager-api:8095 \
  -e NEXT_PUBLIC_FLAG_MANAGER_API_URL=http://localhost:8095 \
  -e RELAY_PROXY_URL=http://relay-proxy:1031 \
  -e NEXT_PUBLIC_RELAY_PROXY_URL=http://localhost:1031 \
  -e DEV_MODE=true \
  neongridlabs/goff-ui:latest
```

The UI is now available at `http://localhost:4000`.

## Features

- **Dashboard** — real-time health status for all platform components
- **Flag management** — create, edit, toggle, and search feature flags
- **Flag evaluator** — test flag evaluations against user contexts
- **Real-time updates** — WebSocket-powered live flag change notifications
- **Activity feed** — audit trail and change history viewer
- **Dark mode** — system-aware theme with manual toggle
- **Keycloak SSO** — OpenID Connect authentication (optional)

## Docker Compose

The recommended way to run the full stack:

```yaml
version: "3.8"

services:
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
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:8095/health"]
      interval: 30s
      timeout: 10s
      retries: 3

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
      AUTH_SECRET: change-this-in-production
    depends_on:
      flag-manager-api:
        condition: service_healthy
      relay-proxy:
        condition: service_started

volumes:
  flags-data:
```

## Environment Variables

### Core

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP listen port |
| `HOSTNAME` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `production` | Node environment |
| `DEV_MODE` | `false` | When `true`, skip authentication (for local development) |

### API Connection

| Variable | Default | Description |
|---|---|---|
| `FLAG_MANAGER_API_URL` | — | Flag Manager API URL (server-side, typically internal Docker network address) |
| `NEXT_PUBLIC_FLAG_MANAGER_API_URL` | — | Flag Manager API URL (client-side, must be reachable from the browser) |
| `RELAY_PROXY_URL` | — | GO Feature Flag relay proxy URL (server-side) |
| `NEXT_PUBLIC_RELAY_PROXY_URL` | — | GO Feature Flag relay proxy URL (client-side, must be reachable from the browser) |

### Authentication — Keycloak

| Variable | Default | Description |
|---|---|---|
| `AUTH_SECRET` | — | NextAuth.js session encryption secret. **Required** when `DEV_MODE=false` |
| `AUTH_URL` | — | Public URL of this UI (e.g. `https://flags.example.com`) |
| `KEYCLOAK_CLIENT_ID` | — | Keycloak OIDC client ID |
| `KEYCLOAK_CLIENT_SECRET` | — | Keycloak OIDC client secret |
| `KEYCLOAK_URL` | — | Keycloak server URL (e.g. `https://keycloak.example.com`) |
| `KEYCLOAK_REALM` | — | Keycloak realm name |

> **Tip:** In production, set `DEV_MODE=false` and configure all Keycloak variables. Generate `AUTH_SECRET` with `openssl rand -base64 32`.

## Exposed Ports

| Port | Description |
|---|---|
| `4000` | Next.js HTTP server |

## Health Check

The UI serves its index page at `/`. Recommended Docker health check:

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:4000"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```

## Architecture

The UI communicates with two backend services:

```
Browser ──► GOFF UI (:4000)
              │  Server-side: FLAG_MANAGER_API_URL
              ├─► Flag Manager API (:8095)   ── flag CRUD, audit, RBAC
              │  Server-side: RELAY_PROXY_URL
              └─► Relay Proxy (:1031)        ── flag evaluation, WebSocket updates
```

**Server-side** variables (`FLAG_MANAGER_API_URL`, `RELAY_PROXY_URL`) are used by Next.js server components and API routes — they should point to internal Docker/Kubernetes service names.

**Client-side** variables (`NEXT_PUBLIC_*`) are embedded at build time into the browser bundle — they must be reachable from the end user's browser.

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
| Base image | `node:22-alpine` |
| Architecture | `linux/amd64` |
| User | `nextjs` (UID 1001), non-root |
| Framework | Next.js 16 (standalone output) |
| Build | Multi-stage (deps → build → production) |

## Source

- [GitHub](https://github.com/wspracklin/go-ui)
- [GO Feature Flag](https://gofeatureflag.org/)

## License

See the [repository](https://github.com/wspracklin/go-ui) for license details.
