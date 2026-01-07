# Local Kubernetes Development

## Options Comparison

| Tool | Startup Time | RAM Usage | Best For |
|------|-------------|-----------|----------|
| **k3d** | ~20 seconds | ~500MB | Fast iteration, CI/CD |
| **kind** | ~60 seconds | ~1GB | Testing, conformance |
| **minikube** | ~2 minutes | ~2GB | Learning, addons |
| **Docker Desktop** | ~2 minutes | ~2GB | Mac/Windows simplicity |

## Recommended: k3d

k3d runs k3s (lightweight Kubernetes) inside Docker containers. It's the fastest option and uses the least resources.

### Install k3d

```bash
# macOS
brew install k3d

# Windows (PowerShell as Admin)
choco install k3d

# Linux
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
```

### Quick Start

```bash
# From the project root
./scripts/local-dev.sh start

# Access the UI
open http://localhost:3000

# Stop when done
./scripts/local-dev.sh stop
```

## Alternative: minikube

If you prefer minikube:

```bash
# Install
brew install minikube  # or choco install minikube

# Start
minikube start --memory=2048 --cpus=2

# Enable ingress
minikube addons enable ingress

# Deploy
kubectl apply -k k8s/local/

# Access (minikube tunnel in separate terminal)
minikube tunnel
```

## What's Different from Production?

| Aspect | Local | Production |
|--------|-------|------------|
| Ingress | NodePort / LoadBalancer | Ingress with TLS |
| Images | Built locally | From registry |
| Secrets | Plain text | Sealed/External Secrets |
| Storage | Local path | PVC with storage class |
| Replicas | 1 | 2+ |

The core architecture (ConfigMap → Flag Manager API → Relay Proxy) is identical.
