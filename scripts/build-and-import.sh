#!/bin/bash
#
# Build and import Docker images into k3d cluster
#
# Usage:
#   ./build-and-import.sh                    # Default cluster and tag
#   ./build-and-import.sh -c my-cluster      # Custom cluster name
#   ./build-and-import.sh -t v1.0.0          # Custom tag
#   ./build-and-import.sh -s                 # Skip build, only import
#

set -e

# Default values
CLUSTER_NAME="goff-local"
TAG="latest"
SKIP_BUILD=false

# Parse arguments
while getopts "c:t:sh" opt; do
    case $opt in
        c) CLUSTER_NAME="$OPTARG" ;;
        t) TAG="$OPTARG" ;;
        s) SKIP_BUILD=true ;;
        h)
            echo "Usage: $0 [-c cluster_name] [-t tag] [-s]"
            echo "  -c    Cluster name (default: goff-local)"
            echo "  -t    Image tag (default: latest)"
            echo "  -s    Skip build, only import existing images"
            exit 0
            ;;
        *)
            echo "Invalid option: -$OPTARG" >&2
            exit 1
            ;;
    esac
done

# Image names
API_IMAGE="goff-manager-api:$TAG"
UI_IMAGE="goff-manager-ui:$TAG"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "======================================"
echo "GO Feature Flag Manager - Build & Import"
echo "======================================"
echo ""
echo "Cluster: $CLUSTER_NAME"
echo "Tag: $TAG"
echo "Project Root: $PROJECT_ROOT"
echo ""

# Check if k3d is installed
if ! command -v k3d &> /dev/null; then
    echo "Error: k3d is not installed. Please install it first:"
    echo "  brew install k3d"
    echo "  or visit: https://k3d.io/"
    exit 1
fi

# Check if Docker is running
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "Error: Docker is not running. Please start Docker."
    exit 1
fi

# Check if cluster exists
if ! k3d cluster list | grep -q "$CLUSTER_NAME"; then
    echo "Cluster '$CLUSTER_NAME' not found. Creating it..."
    k3d cluster create "$CLUSTER_NAME" --agents 1
    echo "Cluster created successfully!"
fi

# Build images
if [ "$SKIP_BUILD" = false ]; then
    echo ""
    echo "Building Docker images..."
    echo ""

    # Build API image
    echo "Building API image: $API_IMAGE"
    API_PATH="$PROJECT_ROOT/flag-manager-api-simple"
    if [ ! -d "$API_PATH" ]; then
        echo "Error: API directory not found at $API_PATH"
        exit 1
    fi

    (cd "$API_PATH" && docker build -t "$API_IMAGE" .)
    echo "API image built successfully!"

    echo ""

    # Build UI image
    echo "Building UI image: $UI_IMAGE"
    UI_PATH="$PROJECT_ROOT/goff-ui"
    if [ ! -d "$UI_PATH" ]; then
        echo "Error: UI directory not found at $UI_PATH"
        exit 1
    fi

    (cd "$UI_PATH" && docker build -t "$UI_IMAGE" .)
    echo "UI image built successfully!"
else
    echo "Skipping build (using existing images)..."
fi

echo ""
echo "Importing images into k3d cluster..."
echo ""

# Import images into k3d
echo "Importing $API_IMAGE..."
k3d image import "$API_IMAGE" -c "$CLUSTER_NAME" || echo "Warning: Failed to import API image"

echo "Importing $UI_IMAGE..."
k3d image import "$UI_IMAGE" -c "$CLUSTER_NAME" || echo "Warning: Failed to import UI image"

# Also import the relay proxy image if not already present
echo "Pulling and importing gofeatureflag/go-feature-flag:latest..."
docker pull gofeatureflag/go-feature-flag:latest
k3d image import gofeatureflag/go-feature-flag:latest -c "$CLUSTER_NAME"

echo ""
echo "======================================"
echo "Build and import completed!"
echo "======================================"
echo ""
echo "Images imported into cluster '$CLUSTER_NAME':"
echo "  - $API_IMAGE"
echo "  - $UI_IMAGE"
echo "  - gofeatureflag/go-feature-flag:latest"
echo ""
echo "To deploy with Helm, run:"
echo ""
echo "  helm install goff-manager ./charts/goff-manager \\"
echo "    --set api.image.repository=goff-manager-api \\"
echo "    --set api.image.tag=$TAG \\"
echo "    --set api.image.pullPolicy=Never \\"
echo "    --set ui.image.repository=goff-manager-ui \\"
echo "    --set ui.image.tag=$TAG \\"
echo "    --set ui.image.pullPolicy=Never \\"
echo "    --set ui.env.devMode=true"
echo ""
echo "Or use the values file:"
echo ""
echo "  helm install goff-manager ./charts/goff-manager -f ./charts/goff-manager/values-local.yaml"
echo ""
