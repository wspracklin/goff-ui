# GO Feature Flag UI

A modern, fully-featured web UI for managing and monitoring [GO Feature Flag](https://github.com/thomaspoignant/go-feature-flag).

## Features

- **Dashboard** - Real-time overview of system health, flag counts, and cache status
- **Flag Management** - Browse, search, and filter all feature flags
- **Flag Details** - View variations, targeting rules, rollout strategies, and metadata
- **Flag Evaluator** - Test flag evaluations with custom contexts
- **Real-time Updates** - WebSocket-based live notifications for flag changes
- **Dark Mode** - Built-in light/dark theme support
- **Kubernetes Ready** - Includes deployment manifests and Docker support

## Getting Started

### Prerequisites

- Node.js 20+
- A running GO Feature Flag relay proxy

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Configuration

1. Navigate to **Settings** in the UI
2. Enter your GO Feature Flag relay proxy URL (default: `http://localhost:1031`)
3. Optionally configure API keys for authentication
4. Click **Test Connection** to verify

### Production Build

```bash
npm run build
npm start
```

## Docker

### Build the Image

```bash
docker build -t goff-ui .
```

### Run the Container

```bash
docker run -p 3000:3000 goff-ui
```

## Kubernetes Deployment

The `k8s/` directory contains ready-to-use Kubernetes manifests:

```bash
# Create namespace and deploy
kubectl apply -k k8s/

# Or apply individually
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/goff-relay-proxy.yaml
kubectl apply -f k8s/goff-ui.yaml
```

### Manifests Included

- `namespace.yaml` - Creates `go-feature-flag` namespace
- `goff-relay-proxy.yaml` - Deploys GO Feature Flag relay proxy with example config
- `goff-ui.yaml` - Deploys this UI with Ingress configuration
- `kustomization.yaml` - Kustomize configuration for easy customization

### Customization

1. Update the image name in `k8s/goff-ui.yaml` to your registry
2. Modify the Ingress hosts in `k8s/goff-ui.yaml`
3. Configure your flag retriever in `k8s/goff-relay-proxy.yaml`
4. Set API keys in the secrets if needed

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐
│                 │     │                      │
│   GOFF UI       │────▶│  GO Feature Flag     │
│   (Next.js)     │     │  Relay Proxy         │
│                 │     │                      │
└─────────────────┘     └──────────────────────┘
        │                        │
        │ REST/WS API            │ Retriever
        │                        │
        ▼                        ▼
┌─────────────────┐     ┌──────────────────────┐
│  Browser        │     │  Flag Configuration  │
│  (User)         │     │  (File/S3/K8s/etc)   │
└─────────────────┘     └──────────────────────┘
```

## API Integration

The UI connects to the GO Feature Flag relay proxy using:

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Health check |
| `GET /info` | Cache refresh info |
| `POST /v1/allflags` | Evaluate all flags |
| `POST /v1/feature/{key}/eval` | Evaluate single flag |
| `POST /v1/flag/configuration` | Get flag configurations |
| `WS /ws/v1/flag/change` | Real-time flag updates |
| `POST /admin/v1/retriever/refresh` | Force flag refresh |

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Data Fetching**: TanStack Query
- **Icons**: Lucide React
- **Notifications**: Sonner


## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard
│   ├── flags/             # Flag list and details
│   ├── evaluator/         # Flag evaluation tester
│   ├── activity/          # Real-time updates
│   └── settings/          # Connection configuration
├── components/
│   ├── layout/            # Sidebar, Header
│   ├── ui/                # Reusable UI components
│   └── providers.tsx      # React Query provider
└── lib/
    ├── api.ts             # GO Feature Flag API client
    ├── store.ts           # Zustand store
    ├── types.ts           # TypeScript types
    └── utils.ts           # Utility functions
k8s/                       # Kubernetes manifests
├── namespace.yaml
├── goff-relay-proxy.yaml
├── goff-ui.yaml
└── kustomization.yaml
```

## Pages

### Dashboard (`/`)
- System health status
- Total flags count (enabled/disabled)
- Last cache refresh time
- Quick access to recent flags
- Flagset information (if configured)

### Flags (`/flags`)
- Searchable list of all flags
- Filter by status (all/enabled/disabled)
- Shows flag type, variation count, and rule count
- Click through to flag details

### Flag Details (`/flags/[key]`)
- Variations with types and values
- Default rule configuration
- Targeting rules with queries and percentages
- Experimentation windows
- Metadata and raw configuration

### Evaluator (`/evaluator`)
- Configure evaluation context (targeting key, custom attributes)
- Single flag or bulk evaluation
- Results show value, variation, reason, and errors
- Copy context to clipboard
- Pre-fill from URL parameter (`?flag=my-flag`)

### Activity (`/activity`)
- WebSocket connection status
- Real-time flag change notifications
- Shows added, deleted, and updated flags
- Clear activity history

### Settings (`/settings`)
- Proxy URL configuration
- API key configuration (evaluation and admin)
- Connection testing
- Admin actions (force flag refresh)

## License

MIT
