#!/bin/bash
# Local Kubernetes Development Script
# Uses k3d to run a local K8s cluster that mirrors production

set -e

CLUSTER_NAME="goff-local"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_dependencies() {
    local missing=()

    command -v docker &> /dev/null || missing+=("docker")
    command -v kubectl &> /dev/null || missing+=("kubectl")
    command -v k3d &> /dev/null || missing+=("k3d")

    if [ ${#missing[@]} -ne 0 ]; then
        log_error "Missing dependencies: ${missing[*]}"
        echo ""
        echo "Install instructions:"
        echo "  docker: https://docs.docker.com/get-docker/"
        echo "  kubectl: https://kubernetes.io/docs/tasks/tools/"
        echo "  k3d: curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash"
        exit 1
    fi
}

create_cluster() {
    if k3d cluster list | grep -q "$CLUSTER_NAME"; then
        log_info "Cluster '$CLUSTER_NAME' already exists"
        return
    fi

    log_info "Creating k3d cluster '$CLUSTER_NAME'..."
    k3d cluster create "$CLUSTER_NAME" \
        --port "4000:4000@server:0" \
        --port "8095:8095@server:0" \
        --port "1031:1031@server:0" \
        --port "30600:30600@server:0" \
        --port "30895:30895@server:0" \
        --port "31031:31031@server:0" \
        --agents 0 \
        --wait

    log_info "Cluster created successfully"
}

build_images() {
    log_info "Building Docker images..."

    # Build Flag Manager API
    log_info "Building flag-manager-api..."
    docker build -t flag-manager-api:local "$PROJECT_ROOT/flag-manager-api"

    # Build Frontend
    log_info "Building goff-ui..."
    docker build -t goff-ui:local "$PROJECT_ROOT/goff-ui"

    log_info "Images built successfully"
}

import_images() {
    log_info "Importing images into k3d cluster..."

    k3d image import flag-manager-api:local -c "$CLUSTER_NAME"
    k3d image import goff-ui:local -c "$CLUSTER_NAME"

    log_info "Images imported successfully"
}

deploy() {
    log_info "Deploying to Kubernetes..."

    # Apply kustomization
    kubectl apply -k "$PROJECT_ROOT/k8s/local/"

    # Wait for deployments
    log_info "Waiting for deployments to be ready..."
    kubectl -n feature-flags wait --for=condition=available deployment/flag-manager-api --timeout=120s
    kubectl -n feature-flags wait --for=condition=available deployment/go-feature-flag --timeout=120s
    kubectl -n feature-flags wait --for=condition=available deployment/goff-ui --timeout=120s

    log_info "Deployment complete!"
}

show_urls() {
    echo ""
    echo "=========================================="
    echo "  GO Feature Flag UI - Local Development"
    echo "=========================================="
    echo ""
    echo "  Frontend:         http://localhost:4000"
    echo "  Flag Manager API: http://localhost:8095"
    echo "  Relay Proxy:      http://localhost:1031"
    echo ""
    echo "  Kubernetes Dashboard:"
    echo "    kubectl -n feature-flags get pods"
    echo ""
    echo "  View logs:"
    echo "    kubectl -n feature-flags logs -f deployment/goff-ui"
    echo "    kubectl -n feature-flags logs -f deployment/flag-manager-api"
    echo "    kubectl -n feature-flags logs -f deployment/go-feature-flag"
    echo ""
    echo "=========================================="
}

stop_cluster() {
    log_info "Stopping cluster '$CLUSTER_NAME'..."
    k3d cluster stop "$CLUSTER_NAME"
    log_info "Cluster stopped. Use 'start' to resume."
}

delete_cluster() {
    log_info "Deleting cluster '$CLUSTER_NAME'..."
    k3d cluster delete "$CLUSTER_NAME"
    log_info "Cluster deleted."
}

start_cluster() {
    if k3d cluster list | grep -q "$CLUSTER_NAME.*running"; then
        log_info "Cluster '$CLUSTER_NAME' is already running"
    elif k3d cluster list | grep -q "$CLUSTER_NAME"; then
        log_info "Starting existing cluster '$CLUSTER_NAME'..."
        k3d cluster start "$CLUSTER_NAME"
    else
        create_cluster
        build_images
        import_images
        deploy
    fi

    # Set kubectl context
    kubectl config use-context "k3d-$CLUSTER_NAME"

    show_urls
}

rebuild() {
    log_info "Rebuilding and redeploying..."
    build_images
    import_images

    # Restart deployments to pick up new images
    kubectl -n feature-flags rollout restart deployment/flag-manager-api
    kubectl -n feature-flags rollout restart deployment/goff-ui

    # Wait for rollout
    kubectl -n feature-flags rollout status deployment/flag-manager-api
    kubectl -n feature-flags rollout status deployment/goff-ui

    log_info "Rebuild complete!"
    show_urls
}

logs() {
    local service=${1:-"all"}

    case $service in
        ui|frontend)
            kubectl -n feature-flags logs -f deployment/goff-ui
            ;;
        api|flag-manager)
            kubectl -n feature-flags logs -f deployment/flag-manager-api
            ;;
        relay|proxy)
            kubectl -n feature-flags logs -f deployment/go-feature-flag
            ;;
        all)
            kubectl -n feature-flags logs -f -l app.kubernetes.io/part-of=feature-flags --max-log-requests=10
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: $0 logs [ui|api|relay|all]"
            exit 1
            ;;
    esac
}

status() {
    echo ""
    echo "Cluster Status:"
    k3d cluster list
    echo ""
    echo "Pods:"
    kubectl -n feature-flags get pods 2>/dev/null || echo "  Namespace not found or cluster not running"
    echo ""
    echo "Services:"
    kubectl -n feature-flags get svc 2>/dev/null || echo "  Namespace not found or cluster not running"
    echo ""
}

usage() {
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  start     Create cluster and deploy (or start existing)"
    echo "  stop      Stop the cluster (preserves state)"
    echo "  delete    Delete the cluster entirely"
    echo "  rebuild   Rebuild images and redeploy"
    echo "  logs      View logs (ui|api|relay|all)"
    echo "  status    Show cluster and pod status"
    echo "  help      Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 start          # Start local development"
    echo "  $0 rebuild        # After code changes"
    echo "  $0 logs ui        # View frontend logs"
    echo "  $0 stop           # Stop for the day"
    echo ""
}

# Main
check_dependencies

case "${1:-}" in
    start)
        start_cluster
        ;;
    stop)
        stop_cluster
        ;;
    delete)
        delete_cluster
        ;;
    rebuild)
        rebuild
        ;;
    logs)
        logs "${2:-all}"
        ;;
    status)
        status
        ;;
    help|--help|-h)
        usage
        ;;
    *)
        usage
        exit 1
        ;;
esac
