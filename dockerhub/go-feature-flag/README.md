# GO Feature Flag — Relay Proxy

CVE-patched build of the [GO Feature Flag](https://gofeatureflag.org/) relay proxy (v1.51.2). Rebuilt from source with Go 1.25.6 to remediate HIGH-severity stdlib vulnerabilities present in the upstream image.

Part of the **GOFF Manager** platform — see also [`neongridlabs/flag-manager-api`](https://hub.docker.com/r/neongridlabs/flag-manager-api) and [`neongridlabs/goff-ui`](https://hub.docker.com/r/neongridlabs/goff-ui).

## Why This Image?

The upstream `gofeatureflag/go-feature-flag:v1.51.2` ships Go 1.25.0, which contains multiple HIGH-severity CVEs:

- CVE-2025-58188
- CVE-2025-58187
- CVE-2025-61725
- CVE-2025-61723
- CVE-2025-61729

This image rebuilds the exact same v1.51.2 release using **Go 1.25.6**, which includes all fixes. The binary and runtime behavior are identical to the upstream release.

## Quick Start

Create a configuration file `relay-proxy-config.yaml`:

```yaml
server:
  port: 1031
  host: 0.0.0.0

retriever:
  kind: http
  url: http://flag-manager-api:8095/api/flags/raw
  method: GET
  timeout: 10000

pollingInterval: 30000
restApiTimeout: 5000
enableAdmin: true
```

Run the container:

```bash
docker run -d \
  --name relay-proxy \
  -p 1031:1031 \
  -v $(pwd)/relay-proxy-config.yaml:/goff/goff-proxy.yaml:ro \
  neongridlabs/go-feature-flag:latest
```

The relay proxy is now available at `http://localhost:1031`. Verify with:

```bash
curl http://localhost:1031/health
```

## Docker Compose

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

volumes:
  flags-data:
```

## Configuration

The relay proxy is configured via a YAML file mounted at `/goff/goff-proxy.yaml`. Environment variables can also override the retriever backend.

### Retriever Backends

The relay proxy fetches flag definitions from a backend. Set `GIT_PROVIDER` to select:

#### HTTP (default) — Flag Manager API

```yaml
retriever:
  kind: http
  url: http://flag-manager-api:8095/api/flags/raw
  method: GET
  timeout: 10000
```

No extra environment variables needed beyond `FLAG_MANAGER_API_URL`.

#### Azure DevOps Git

| Variable | Description |
|---|---|
| `GIT_PROVIDER` | Set to `ado` |
| `ADO_ORG_URL` | Organization URL (e.g. `https://dev.azure.com/myorg`) |
| `ADO_PROJECT` | Project name |
| `ADO_REPOSITORY` | Repository name |
| `ADO_PAT` | Personal Access Token |
| `ADO_FLAGS_PATH` | Path to flags file (e.g. `/flags.yaml`) |

#### GitLab Git

| Variable | Description |
|---|---|
| `GIT_PROVIDER` | Set to `gitlab` |
| `GITLAB_URL` | GitLab instance URL (e.g. `https://gitlab.com`) |
| `GITLAB_PROJECT_ID` | Numeric project ID |
| `GITLAB_TOKEN` | Personal access token |
| `GITLAB_FLAGS_PATH` | Path to flags file (e.g. `flags.yaml`) |
| `GITLAB_BRANCH` | Branch to read from (default: `main`) |

### General Settings

| Variable | Default | Description |
|---|---|---|
| `POLLING_INTERVAL` | `30000` | How often to poll the retriever for updates (ms) |
| `REST_API_TIMEOUT` | `5000` | REST API request timeout (ms) |
| `ENABLE_ADMIN` | `true` | Enable admin endpoints (manual refresh) |
| `ENABLE_OFREP` | `true` | Enable OpenFeature Remote Evaluation Protocol |
| `DEBUG` | `false` | Enable debug logging |

### API Authorization

| Variable | Default | Description |
|---|---|---|
| `AUTHORIZED_KEYS_EVALUATION` | — | Comma-separated API keys for evaluation endpoints |
| `AUTHORIZED_KEYS_ADMIN` | — | Comma-separated API keys for admin endpoints |

## Volumes

| Path | Description |
|---|---|
| `/goff/goff-proxy.yaml` | Relay proxy configuration file (mount read-only) |

## Exposed Ports

| Port | Description |
|---|---|
| `1031` | Relay proxy HTTP/WebSocket server |

## Health Check

```bash
curl http://localhost:1031/health
```

Recommended Docker health check:

```yaml
healthcheck:
  test: ["CMD", "wget", "-q", "--spider", "http://localhost:1031/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/info` | Relay proxy info and cache status |
| `POST` | `/v1/allflags` | Evaluate all flags for a user context |
| `POST` | `/v1/feature/{key}/eval` | Evaluate a single flag |
| `POST` | `/v1/flag/configuration` | Get raw flag configurations |
| `WS` | `/ws/v1/flag/change` | WebSocket stream of real-time flag changes |
| `POST` | `/admin/v1/retriever/refresh` | Force flag cache refresh (admin) |

## Architecture

```
Client SDKs ──► Relay Proxy (:1031) ◄── polls ── Flag Manager API (:8095)
                     │                                    │
                     │  WebSocket                    CRUD / audit
                     ▼                                    │
                GOFF UI (:4000) ──────────────────────────┘
```

The relay proxy sits between your application's feature flag SDKs and the flag storage backend. It caches flag definitions locally and serves evaluations with low latency.

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
| Base image | `gcr.io/distroless/static-debian12` |
| Architecture | `linux/amd64` |
| User | Non-root (distroless default) |
| Upstream | [go-feature-flag v1.51.2](https://github.com/thomaspoignant/go-feature-flag/releases/tag/v1.51.2) |
| Go version | 1.25.6 (CVE-patched) |
| Binary | Statically compiled, no CGO |
| Shell | None (distroless — minimal attack surface) |

## Source

- [GitHub](https://github.com/wspracklin/go-ui)
- [Upstream GO Feature Flag](https://github.com/thomaspoignant/go-feature-flag)
- [GO Feature Flag Documentation](https://gofeatureflag.org/)

## License

See the [repository](https://github.com/wspracklin/go-ui) for license details.
