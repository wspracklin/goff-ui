#!/bin/bash
#
# Build, tag, and push goff-ui Docker image to neongridlabs/goff-ui
#
# Usage:
#   ./scripts/release-goff-ui.sh              # bump patch (0.1.0 -> 0.1.1)
#   ./scripts/release-goff-ui.sh minor        # bump minor (0.1.0 -> 0.2.0)
#   ./scripts/release-goff-ui.sh major        # bump major (0.1.0 -> 1.0.0)
#   ./scripts/release-goff-ui.sh 2.0.0        # set explicit version
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
UI_DIR="$PROJECT_ROOT/goff-ui"
IMAGE="neongridlabs/goff-ui"
BUMP="${1:-patch}"

# Read current version from package.json
CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' "$UI_DIR/package.json" | head -1 | grep -o '[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*')

if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: Could not read version from package.json"
    exit 1
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
echo "  goff-ui release"
echo "=========================================="
echo ""
echo "  Current version: $CURRENT_VERSION"
echo "  New version:     $NEW_VERSION"
echo "  Image:           $IMAGE"
echo ""

# Update version in package.json
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$UI_DIR/package.json"
echo "[1/4] Updated package.json to $NEW_VERSION"

# Build
echo "[2/4] Building Docker image..."
docker build -t "$IMAGE:$NEW_VERSION" -t "$IMAGE:latest" "$UI_DIR"

# Push
echo "[3/4] Pushing $IMAGE:$NEW_VERSION..."
docker push "$IMAGE:$NEW_VERSION"

echo "[4/4] Pushing $IMAGE:latest..."
docker push "$IMAGE:latest"

echo ""
echo "=========================================="
echo "  Released $IMAGE:$NEW_VERSION"
echo "=========================================="
