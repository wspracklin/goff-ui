# GO Feature Flag Management System

A feature flag management system built on top of [GO Feature Flag](https://gofeatureflag.org/). Provides a web UI for managing flags, with support for git-based workflows, notifications, and multiple storage backends.

## Quick Start

```bash
# Start all services
docker-compose up -d

# Open the UI
open http://localhost:4000
```

That's it! The system runs with:
- **UI**: http://localhost:4000
- **Flag Manager API**: http://localhost:8095
- **Relay Proxy**: http://localhost:1031

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                       Flag Manager API                           │   │
│  │  • CRUD operations for feature flags                            │   │
│  │  • Git integration (ADO, GitLab) for PR-based changes           │   │
│  │  • Flag Sets, Notifiers, Exporters, Retrievers config           │   │
│  │  • Serves flags to relay proxy via HTTP                         │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                           │
│            ┌────────────────┼────────────────┐                         │
│            │                │                │                          │
│            ▼                ▼                ▼                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │   Frontend   │  │ GO Feature   │  │  Your Apps   │                  │
│  │   (Next.js)  │  │ Flag Relay   │  │   (SDKs)     │                  │
│  │              │  │    Proxy     │  │              │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Features

### Core Features
- **Flag Management**: Create, edit, delete feature flags with targeting rules
- **Project Organization**: Organize flags by project
- **Flag Evaluator**: Test flag evaluations with custom contexts
- **Activity Tracking**: View flag change history

### Advanced Configuration
- **Git Integrations**: Connect to Azure DevOps or GitLab for PR-based flag changes
- **Flag Sets**: Group flags with independent retrievers, exporters, and API keys
- **Notifiers**: Get notified of flag changes via Slack, Discord, MS Teams, or Webhooks
- **Exporters**: Export flag evaluation data to S3, Kafka, Webhook, File, and more
- **Retrievers**: Configure flag sources (File, HTTP, S3, GCS, GitHub, GitLab, MongoDB, Redis, K8s ConfigMap)

## Components

### 1. Flag Manager API (`flag-manager-api-simple/`)
A Go service providing:
- CRUD operations for feature flags (stored as YAML files)
- Git integration for PR-based workflows (ADO, GitLab)
- Configuration management for Flag Sets, Notifiers, Exporters, Retrievers
- HTTP endpoint for relay proxy flag retrieval
- Triggers relay proxy refresh after updates

### 2. GO Feature Flag Relay Proxy
The official GO Feature Flag relay proxy configured with:
- HTTP retriever pointing to Flag Manager API
- Polling for automatic flag updates
- Admin API for manual refresh

### 3. Frontend UI (`goff-ui/`)
Next.js application providing:
- Flag management dashboard
- Flag editor with targeting rules and rollout strategies
- Settings pages for Integrations, Flag Sets, Notifiers, Exporters, Retrievers
- Flag evaluator for testing
- Activity tracking
- Keycloak authentication (production) or dev mode

## Deployment Options

### Option 1: Docker Compose (Recommended)

```bash
# Basic setup
docker-compose up -d

# With Git provider (ADO example)
ADO_ORG_URL=https://dev.azure.com/myorg \
ADO_PROJECT=myproject \
ADO_REPOSITORY=myrepo \
ADO_PAT=your-pat \
docker-compose -f docker-compose.ado.yml up -d

# With Git provider (GitLab example)
GITLAB_URL=https://gitlab.com \
GITLAB_PROJECT_ID=12345 \
GITLAB_TOKEN=your-token \
docker-compose -f docker-compose.gitlab.yml up -d
```

### Option 2: Kubernetes (k3d for local)

```powershell
# Windows
.\scripts\local-dev.ps1 start

# macOS/Linux
./scripts/local-dev.sh start
```

Then open http://localhost:30000

### Option 3: Helm Chart (Production Kubernetes)

```bash
# Install with default values
helm install goff-manager ./charts/goff-manager

# Install with custom values
helm install goff-manager ./charts/goff-manager \
  --set api.image.repository=your-registry/flag-manager-api \
  --set ui.image.repository=your-registry/goff-ui \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=flags.example.com

# Install with Azure DevOps integration
helm install goff-manager ./charts/goff-manager \
  --set api.git.provider=ado \
  --set api.git.ado.orgUrl=https://dev.azure.com/myorg \
  --set api.git.ado.project=myproject \
  --set api.git.ado.repository=myrepo \
  --set api.git.ado.pat=your-pat

# Install with GitLab integration
helm install goff-manager ./charts/goff-manager \
  --set api.git.provider=gitlab \
  --set api.git.gitlab.url=https://gitlab.com \
  --set api.git.gitlab.projectId=12345 \
  --set api.git.gitlab.token=your-token
```

See `charts/goff-manager/values.yaml` for all configuration options.

### Option 4: Kubernetes (Kustomize)

1. **Build and push images:**
   ```bash
   # Flag Manager API
   cd flag-manager-api-simple
   docker build -t your-registry/flag-manager-api:latest .
   docker push your-registry/flag-manager-api:latest

   # Frontend
   cd goff-ui
   docker build -t your-registry/goff-ui:latest .
   docker push your-registry/goff-ui:latest
   ```

2. **Deploy:**
   ```bash
   kubectl apply -k k8s/base/
   ```

## API Endpoints

### Flag Manager API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects/{project}` | Create a project |
| DELETE | `/api/projects/{project}` | Delete a project |
| GET | `/api/projects/{project}/flags` | List flags for a project |
| GET | `/api/projects/{project}/flags/{key}` | Get a specific flag |
| POST | `/api/projects/{project}/flags/{key}` | Create a flag |
| PUT | `/api/projects/{project}/flags/{key}` | Update a flag |
| DELETE | `/api/projects/{project}/flags/{key}` | Delete a flag |
| POST | `/api/projects/{project}/flags/propose` | Create PR for flag change |
| GET | `/api/flags/raw` | Get all flags (for relay proxy) |
| POST | `/api/admin/refresh` | Trigger relay proxy refresh |

### Configuration APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/integrations` | Git integrations (ADO, GitLab) |
| GET/POST | `/api/flagsets` | Flag set configurations |
| GET/POST | `/api/notifiers` | Notification configurations |
| GET/POST | `/api/exporters` | Exporter configurations |
| GET/POST | `/api/retrievers` | Retriever configurations |

### GO Feature Flag Relay Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/info` | System information |
| GET | `/v1/allflags` | Get all flag configurations |
| POST | `/v1/feature/{key}/eval` | Evaluate a flag |

## Configuration

### Environment Variables

#### Flag Manager API
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8095` | API port |
| `FLAGS_DIR` | `/data/flags` | Directory for flag YAML files |
| `RELAY_PROXY_URL` | `http://relay-proxy:1031` | Relay proxy URL |
| `GIT_PROVIDER` | - | Git provider (`ado` or `gitlab`) |
| `ADO_ORG_URL` | - | Azure DevOps organization URL |
| `ADO_PROJECT` | - | Azure DevOps project name |
| `ADO_REPOSITORY` | - | Azure DevOps repository name |
| `ADO_PAT` | - | Azure DevOps personal access token |
| `GITLAB_URL` | - | GitLab instance URL |
| `GITLAB_PROJECT_ID` | - | GitLab project ID |
| `GITLAB_TOKEN` | - | GitLab access token |
| `GIT_BASE_BRANCH` | `main` | Base branch for PRs |
| `GIT_FLAGS_PATH` | `/flags.yaml` | Path to flags file in repo |

#### Frontend (goff-ui)
| Variable | Default | Description |
|----------|---------|-------------|
| `DEV_MODE` | `false` | Enable development mode (skip auth) |
| `FLAG_MANAGER_API_URL` | `http://localhost:8095` | Flag Manager API URL (server-side) |
| `NEXT_PUBLIC_FLAG_MANAGER_API_URL` | `http://localhost:8095` | Flag Manager API URL (client-side) |
| `RELAY_PROXY_URL` | `http://localhost:1031` | Relay proxy URL |
| `AUTH_SECRET` | - | NextAuth secret |
| `KEYCLOAK_*` | - | Keycloak OAuth settings |

## Project Structure

```
go-ui/
├── flag-manager-api-simple/   # Go Flag Manager API (file-based)
│   ├── main.go                # Core API
│   ├── integrations.go        # Git integration management
│   ├── flagsets.go            # Flag set management
│   ├── notifiers.go           # Notification configs
│   ├── exporters.go           # Exporter configs
│   ├── retrievers.go          # Retriever configs
│   ├── git/                   # Git providers (ADO, GitLab)
│   ├── Dockerfile
│   └── go.mod
├── flag-manager-api/          # Go Flag Manager API (K8s ConfigMap)
│   ├── main.go
│   ├── Dockerfile
│   └── go.mod
├── goff-ui/                   # Next.js Frontend
│   ├── src/
│   │   ├── app/              # App router pages
│   │   ├── components/       # React components
│   │   └── lib/              # Utilities and API clients
│   ├── Dockerfile
│   └── package.json
├── charts/                    # Helm charts
│   └── goff-manager/          # Main Helm chart
├── k8s/                       # Kubernetes manifests (Kustomize)
│   └── base/
├── scripts/                   # Development scripts
│   ├── local-dev.ps1         # Windows k3d script
│   ├── local-dev.sh          # Linux/macOS k3d script
│   └── restart.ps1
├── docker-compose.yml         # Basic Docker Compose
├── docker-compose.ado.yml     # With Azure DevOps
├── docker-compose.gitlab.yml  # With GitLab
├── relay-proxy-config.yaml    # Relay proxy configuration
└── README.md
```

## Development

### Running Locally (Without Docker)

1. **Start the Flag Manager API:**
   ```bash
   cd flag-manager-api-simple
   FLAGS_DIR=./flags PORT=8095 go run .
   ```

2. **Start the Frontend:**
   ```bash
   cd goff-ui
   cp .env.example .env.local
   # Edit .env.local with your settings
   npm install
   npm run dev
   ```

3. **Start GO Feature Flag relay proxy:**
   ```bash
   docker run -p 1031:1031 \
     -v $(pwd)/relay-proxy-config.yaml:/goff/goff-proxy.yaml:ro \
     gofeatureflag/go-feature-flag:latest
   ```

### Running Tests

```bash
# API tests
cd flag-manager-api-simple
go test -v ./...

# Frontend tests
cd goff-ui
npm run test
```

## Troubleshooting

### Flags not updating
1. Check Flag Manager API logs: `docker-compose logs flag-manager-api`
2. Verify flags directory has files: `docker-compose exec flag-manager-api ls /data/flags`
3. Check relay proxy logs: `docker-compose logs relay-proxy`
4. Manually trigger refresh: `curl -X POST http://localhost:8095/api/admin/refresh`

### Connection refused errors
1. Verify all services are running: `docker-compose ps`
2. Check service health: `curl http://localhost:8095/health`
3. Check relay proxy health: `curl http://localhost:1031/health`

### Git integration not working
1. Verify credentials in environment variables
2. Test integration from UI: Settings > Git Integrations > Test Connection
3. Check API logs for detailed error messages

---

## License

MIT License - see [LICENSE](LICENSE) for details.
