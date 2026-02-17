#!/bin/bash
#
# Build, tag, and push go-feature-flag relay proxy Docker image to neongridlabs/go-feature-flag
#
# Usage:
#   ./scripts/release-go-feature-flag.sh              # bump patch (0.1.0 -> 0.1.1)
#   ./scripts/release-go-feature-flag.sh minor        # bump minor (0.1.0 -> 0.2.0)
#   ./scripts/release-go-feature-flag.sh major        # bump major (0.1.0 -> 1.0.0)
#   ./scripts/release-go-feature-flag.sh 2.0.0        # set explicit version
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
PROXY_DIR="$PROJECT_ROOT/go-feature-flag"
IMAGE="neongridlabs/go-feature-flag"
VERSION_FILE="$PROXY_DIR/VERSION"
BUMP="${1:-patch}"

# Read current version from VERSION file (or default to 0.1.0)
if [ -f "$VERSION_FILE" ]; then
    CURRENT_VERSION=$(cat "$VERSION_FILE" | tr -d '[:space:]')
else
    CURRENT_VERSION="0.1.0"
fi

if [ -z "$CURRENT_VERSION" ]; then
    CURRENT_VERSION="0.1.0"
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Calculate new version
case "$BUMP" in
    patch)
        NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
        ;;
    minor)
        NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
        ;;
    major)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        ;;
    [0-9]*.*)
        NEW_VERSION="$BUMP"
        ;;
    *)
        echo "Usage: $0 [patch|minor|major|<version>]"
        exit 1
        ;;
esac

echo "=========================================="
echo "  go-feature-flag relay proxy release"
echo "=========================================="
echo ""
echo "  Current version: $CURRENT_VERSION"
echo "  New version:     $NEW_VERSION"
echo "  Image:           $IMAGE"
echo ""

# Update version file
echo "$NEW_VERSION" > "$VERSION_FILE"
echo "[1/4] Updated VERSION to $NEW_VERSION"

# Build
echo "[2/4] Building Docker image..."
docker build -t "$IMAGE:$NEW_VERSION" -t "$IMAGE:latest" "$PROXY_DIR"

# Push
echo "[3/4] Pushing $IMAGE:$NEW_VERSION..."
docker push "$IMAGE:$NEW_VERSION"

echo "[4/4] Pushing $IMAGE:latest..."
docker push "$IMAGE:latest"

echo ""
echo "=========================================="
echo "  Released $IMAGE:$NEW_VERSION"
echo "=========================================="
