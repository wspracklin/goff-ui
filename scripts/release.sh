#!/bin/bash
#
# Unified Release Script for GO Feature Flag Manager
#
# Detects changes, builds Docker images, updates Helm charts, creates git tags.
#
# Usage:
#   ./scripts/release.sh [OPTIONS] [BUMP_TYPE]
#
# BUMP_TYPE:  patch (default) | minor | major
#
# OPTIONS:
#   --dry-run        Preview what would happen, no side effects
#   --only <name>    Only release specific component(s): api, ui, relay (repeatable)
#   --force          Skip change detection, release specified components regardless
#   --skip-helm      Skip Helm chart packaging and chart repo push
#   --skip-docker    Skip Docker build and push
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# On Git Bash / MSYS2 (Windows), convert to mixed-mode paths (D:/path)
# so they work in both bash and node.js
if command -v cygpath &>/dev/null; then
    PROJECT_ROOT="$(cygpath -m "$PROJECT_ROOT")"
fi

# --- CLI argument parsing ---
DRY_RUN=false
FORCE=false
SKIP_HELM=false
SKIP_DOCKER=false
BUMP_TYPE="patch"
declare -a ONLY_COMPONENTS=()

while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --only)
            ONLY_COMPONENTS+=("$2")
            shift 2
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --skip-helm)
            SKIP_HELM=true
            shift
            ;;
        --skip-docker)
            SKIP_DOCKER=true
            shift
            ;;
        patch|minor|major)
            BUMP_TYPE="$1"
            shift
            ;;
        -h|--help)
            sed -n '3,18p' "$0" | sed 's/^# \?//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Run with --help for usage."
            exit 1
            ;;
    esac
done

# --- Color helpers ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()   { echo -e "${RED}[ERROR]${NC} $*"; }

# ============================================================================
# Phase 0 — Prerequisites
# ============================================================================

check_prereqs() {
    local missing=()

    if ! command -v git &>/dev/null; then
        missing+=("git")
    fi

    if [[ "$SKIP_DOCKER" != "true" ]] && ! command -v docker &>/dev/null; then
        missing+=("docker (or use --skip-docker)")
    fi

    if [[ "$SKIP_HELM" != "true" ]] && ! command -v helm &>/dev/null; then
        missing+=("helm (or use --skip-helm)")
    fi

    # We need jq or node for JSON manipulation
    if ! command -v jq &>/dev/null && ! command -v node &>/dev/null; then
        missing+=("jq or node (for JSON processing)")
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        err "Missing required tools:"
        for tool in "${missing[@]}"; do
            echo "  - $tool"
        done
        exit 1
    fi
}

check_prereqs

# --- JSON helpers (jq with node fallback) ---

json_read() {
    local file="$1"
    local query="$2"  # jq-style query like .platform or .components.api.version
    if command -v jq &>/dev/null; then
        jq -r "$query" "$file"
    else
        # Convert jq query to JS property chain: .components.api.version → data.components.api.version
        local js_path="data${query}"
        node -e "const data = JSON.parse(require('fs').readFileSync('$file','utf8')); console.log(${js_path});"
    fi
}

json_write() {
    local file="$1"
    local content="$2"  # full JSON string
    echo "$content" > "$file"
}

# ============================================================================
# Phase 1 — Read versions.json
# ============================================================================

VERSIONS_FILE="$PROJECT_ROOT/versions.json"

if [[ ! -f "$VERSIONS_FILE" ]]; then
    err "versions.json not found at $VERSIONS_FILE"
    exit 1
fi

PLATFORM_VERSION=$(json_read "$VERSIONS_FILE" '.platform')

# Read component metadata
API_VERSION=$(json_read "$VERSIONS_FILE" '.components.api.version')
API_DIR=$(json_read "$VERSIONS_FILE" '.components.api.dir')
API_IMAGE=$(json_read "$VERSIONS_FILE" '.components.api.image')
API_HELM_KEY=$(json_read "$VERSIONS_FILE" '.components.api.helmKey')

UI_VERSION=$(json_read "$VERSIONS_FILE" '.components.ui.version')
UI_DIR=$(json_read "$VERSIONS_FILE" '.components.ui.dir')
UI_IMAGE=$(json_read "$VERSIONS_FILE" '.components.ui.image')
UI_HELM_KEY=$(json_read "$VERSIONS_FILE" '.components.ui.helmKey')

RELAY_VERSION=$(json_read "$VERSIONS_FILE" '.components.relay.version')
RELAY_DIR=$(json_read "$VERSIONS_FILE" '.components.relay.dir')
RELAY_IMAGE=$(json_read "$VERSIONS_FILE" '.components.relay.image')
RELAY_HELM_KEY=$(json_read "$VERSIONS_FILE" '.components.relay.helmKey')

info "Loaded versions.json (platform: v${PLATFORM_VERSION})"

# ============================================================================
# Phase 2 — Detect changes via git diff
# ============================================================================

cd "$PROJECT_ROOT"

# Find the latest platform tag as comparison base
LATEST_TAG=$(git tag -l 'platform-v*' --sort=-v:refname | head -n1 || true)

if [[ -z "$LATEST_TAG" ]]; then
    info "No previous platform-v* tag found — treating all components as changed (first release)"
    DIFF_BASE=$(git rev-list --max-parents=0 HEAD | head -n1)
else
    info "Comparing against tag: $LATEST_TAG"
    DIFF_BASE="$LATEST_TAG"
fi

# Detect changes per component
detect_changes() {
    local dir="$1"
    if ! git diff --quiet "$DIFF_BASE"..HEAD -- "$dir/" 2>/dev/null; then
        return 0  # changed
    fi
    return 1  # not changed
}

API_CHANGED=false
UI_CHANGED=false
RELAY_CHANGED=false
CHART_CHANGED=false

if detect_changes "$API_DIR"; then API_CHANGED=true; fi
if detect_changes "$UI_DIR"; then UI_CHANGED=true; fi
if detect_changes "$RELAY_DIR"; then RELAY_CHANGED=true; fi
if detect_changes "charts/goff-manager"; then CHART_CHANGED=true; fi

# Apply --only filter
if [[ ${#ONLY_COMPONENTS[@]} -gt 0 ]]; then
    # Start with all false, then enable only specified
    [[ ! " ${ONLY_COMPONENTS[*]} " =~ " api " ]] && API_CHANGED=false
    [[ ! " ${ONLY_COMPONENTS[*]} " =~ " ui " ]] && UI_CHANGED=false
    [[ ! " ${ONLY_COMPONENTS[*]} " =~ " relay " ]] && RELAY_CHANGED=false
fi

# Apply --force override
if [[ "$FORCE" == "true" ]]; then
    if [[ ${#ONLY_COMPONENTS[@]} -gt 0 ]]; then
        for comp in "${ONLY_COMPONENTS[@]}"; do
            case "$comp" in
                api) API_CHANGED=true ;;
                ui) UI_CHANGED=true ;;
                relay) RELAY_CHANGED=true ;;
                *) warn "Unknown component: $comp" ;;
            esac
        done
    else
        API_CHANGED=true
        UI_CHANGED=true
        RELAY_CHANGED=true
    fi
fi

# Determine if anything changed
ANY_COMPONENT_CHANGED=false
if [[ "$API_CHANGED" == "true" || "$UI_CHANGED" == "true" || "$RELAY_CHANGED" == "true" ]]; then
    ANY_COMPONENT_CHANGED=true
fi

if [[ "$ANY_COMPONENT_CHANGED" == "false" && "$CHART_CHANGED" == "false" ]]; then
    info "No changes detected since $LATEST_TAG. Nothing to release."
    info "Use --force to release anyway."
    exit 0
fi

# ============================================================================
# Phase 3 — Compute new versions
# ============================================================================

bump_version() {
    local version="$1"
    local bump="$2"
    local major minor patch
    IFS='.' read -r major minor patch <<< "$version"

    case "$bump" in
        patch) echo "$major.$minor.$((patch + 1))" ;;
        minor) echo "$major.$((minor + 1)).0" ;;
        major) echo "$((major + 1)).0.0" ;;
    esac
}

NEW_API_VERSION="$API_VERSION"
NEW_UI_VERSION="$UI_VERSION"
NEW_RELAY_VERSION="$RELAY_VERSION"
NEW_PLATFORM_VERSION="$PLATFORM_VERSION"

if [[ "$API_CHANGED" == "true" ]]; then
    NEW_API_VERSION=$(bump_version "$API_VERSION" "$BUMP_TYPE")
fi

if [[ "$UI_CHANGED" == "true" ]]; then
    NEW_UI_VERSION=$(bump_version "$UI_VERSION" "$BUMP_TYPE")
fi

if [[ "$RELAY_CHANGED" == "true" ]]; then
    NEW_RELAY_VERSION=$(bump_version "$RELAY_VERSION" "$BUMP_TYPE")
fi

# Platform version always bumps if anything changed
if [[ "$ANY_COMPONENT_CHANGED" == "true" || "$CHART_CHANGED" == "true" ]]; then
    NEW_PLATFORM_VERSION=$(bump_version "$PLATFORM_VERSION" "$BUMP_TYPE")
fi

# ============================================================================
# Phase 4 — Preview & confirm
# ============================================================================

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${BOLD}  Release Preview${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  Bump type:  ${CYAN}${BUMP_TYPE}${NC}"
echo -e "  Platform:   ${CYAN}v${PLATFORM_VERSION}${NC} → ${GREEN}v${NEW_PLATFORM_VERSION}${NC}"
echo ""

print_component() {
    local name="$1" changed="$2" old_ver="$3" new_ver="$4"
    if [[ "$changed" == "true" ]]; then
        printf "  %-10s ${GREEN}[CHANGED]${NC}  v%-8s → ${GREEN}v%-8s${NC}\n" "$name" "$old_ver" "$new_ver"
    else
        printf "  %-10s ${YELLOW}[SKIP]${NC}     v%-8s   (unchanged)\n" "$name" "$old_ver"
    fi
}

print_component "API" "$API_CHANGED" "$API_VERSION" "$NEW_API_VERSION"
print_component "UI" "$UI_CHANGED" "$UI_VERSION" "$NEW_UI_VERSION"
print_component "Relay" "$RELAY_CHANGED" "$RELAY_VERSION" "$NEW_RELAY_VERSION"

if [[ "$CHART_CHANGED" == "true" && "$ANY_COMPONENT_CHANGED" == "false" ]]; then
    echo ""
    echo -e "  ${CYAN}Chart-only change detected${NC} — no component versions bumped"
fi

echo ""
echo -e "  Docker:     $([ "$SKIP_DOCKER" == "true" ] && echo -e "${YELLOW}SKIP${NC}" || echo -e "${GREEN}enabled${NC}")"
echo -e "  Helm:       $([ "$SKIP_HELM" == "true" ] && echo -e "${YELLOW}SKIP${NC}" || echo -e "${GREEN}enabled${NC}")"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
    echo -e "${YELLOW}[DRY RUN] No changes will be made.${NC}"
    exit 0
fi

# Check for dirty working tree
if ! git diff --quiet HEAD 2>/dev/null || [[ -n "$(git ls-files --others --exclude-standard)" ]]; then
    warn "Working tree has uncommitted changes."
    read -r -p "Continue anyway? (y/N) " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 1
    fi
fi

read -r -p "Proceed with release? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 1
fi

# ============================================================================
# Phase 5 — Update version files
# ============================================================================

info "Updating version files..."

# Update versions.json
if command -v jq &>/dev/null; then
    jq \
        --arg pv "$NEW_PLATFORM_VERSION" \
        --arg av "$NEW_API_VERSION" \
        --arg uv "$NEW_UI_VERSION" \
        --arg rv "$NEW_RELAY_VERSION" \
        '.platform = $pv | .components.api.version = $av | .components.ui.version = $uv | .components.relay.version = $rv' \
        "$VERSIONS_FILE" > "$VERSIONS_FILE.tmp" && mv "$VERSIONS_FILE.tmp" "$VERSIONS_FILE"
else
    node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('$VERSIONS_FILE', 'utf8'));
data.platform = '$NEW_PLATFORM_VERSION';
data.components.api.version = '$NEW_API_VERSION';
data.components.ui.version = '$NEW_UI_VERSION';
data.components.relay.version = '$NEW_RELAY_VERSION';
fs.writeFileSync('$VERSIONS_FILE', JSON.stringify(data, null, 2) + '\n');
"
fi
ok "Updated versions.json"

# Update component version files
if [[ "$API_CHANGED" == "true" ]]; then
    echo "$NEW_API_VERSION" > "$PROJECT_ROOT/$API_DIR/VERSION"
    ok "Updated $API_DIR/VERSION → $NEW_API_VERSION"
fi

if [[ "$UI_CHANGED" == "true" ]]; then
    node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PROJECT_ROOT/$UI_DIR/package.json', 'utf8'));
pkg.version = '$NEW_UI_VERSION';
fs.writeFileSync('$PROJECT_ROOT/$UI_DIR/package.json', JSON.stringify(pkg, null, 2) + '\n');
"
    ok "Updated $UI_DIR/package.json version → $NEW_UI_VERSION"
fi

if [[ "$RELAY_CHANGED" == "true" ]]; then
    echo "$NEW_RELAY_VERSION" > "$PROJECT_ROOT/$RELAY_DIR/VERSION"
    ok "Updated $RELAY_DIR/VERSION → $NEW_RELAY_VERSION"
fi

# ============================================================================
# Phase 6 — Docker build & push
# ============================================================================

if [[ "$SKIP_DOCKER" != "true" ]]; then
    info "Building and pushing Docker images..."

    docker_build_push() {
        local image="$1" version="$2" dir="$3" name="$4"
        info "Building $name ($image:$version)..."
        docker build -t "$image:$version" -t "$image:latest" "$PROJECT_ROOT/$dir"
        info "Pushing $image:$version..."
        docker push "$image:$version"
        docker push "$image:latest"
        ok "$name $image:$version pushed"
    }

    if [[ "$API_CHANGED" == "true" ]]; then
        docker_build_push "$API_IMAGE" "$NEW_API_VERSION" "$API_DIR" "API"
    fi

    if [[ "$UI_CHANGED" == "true" ]]; then
        docker_build_push "$UI_IMAGE" "$NEW_UI_VERSION" "$UI_DIR" "UI"
    fi

    if [[ "$RELAY_CHANGED" == "true" ]]; then
        docker_build_push "$RELAY_IMAGE" "$NEW_RELAY_VERSION" "$RELAY_DIR" "Relay"
    fi

    # --- Push Docker Hub READMEs ---
    push_dockerhub_readme() {
        local image="$1" readme="$2"
        if [[ ! -f "$readme" ]]; then
            warn "README not found at $readme — skipping"
            return
        fi
        local ns="${image%%/*}"
        local repo="${image#*/}"
        local content
        content=$(cat "$readme")
        local payload
        payload=$(jq -n --arg desc "$content" '{ full_description: $desc }')

        local response
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -X PATCH "https://hub.docker.com/v2/repositories/${ns}/${repo}/" \
            -H "Authorization: Bearer $DOCKERHUB_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$payload")

        if [[ "$response" == "200" ]]; then
            ok "Pushed README for $image"
        else
            warn "Failed to push README for $image (HTTP $response)"
        fi
    }

    DOCKERHUB_TOKEN=""
    DOCKER_CONFIG="${HOME}/.docker/config.json"
    if [[ -f "$DOCKER_CONFIG" ]] && command -v jq &>/dev/null; then
        HUB_AUTH=$(jq -r '.auths["https://index.docker.io/v1/"].auth // empty' "$DOCKER_CONFIG")
        if [[ -n "$HUB_AUTH" ]]; then
            DECODED=$(echo "$HUB_AUTH" | base64 -d 2>/dev/null)
            HUB_USER="${DECODED%%:*}"
            HUB_PASS="${DECODED#*:}"
            DOCKERHUB_TOKEN=$(curl -s -X POST "https://hub.docker.com/v2/users/login/" \
                -H "Content-Type: application/json" \
                -d "{\"username\":\"$HUB_USER\",\"password\":\"$HUB_PASS\"}" | jq -r '.token // empty')
        fi
    fi

    if [[ -n "$DOCKERHUB_TOKEN" ]]; then
        push_dockerhub_readme "$API_IMAGE"   "$PROJECT_ROOT/dockerhub/flag-manager-api/README.md"
        push_dockerhub_readme "$UI_IMAGE"    "$PROJECT_ROOT/dockerhub/goff-ui/README.md"
        push_dockerhub_readme "$RELAY_IMAGE" "$PROJECT_ROOT/dockerhub/go-feature-flag/README.md"
    else
        warn "No Docker Hub credentials found — skipping README push"
    fi
else
    info "Skipping Docker build & push (--skip-docker)"
fi

# ============================================================================
# Phase 7 — Update Helm chart
# ============================================================================

CHART_DIR="$PROJECT_ROOT/charts/goff-manager"
CHART_YAML="$CHART_DIR/Chart.yaml"
VALUES_YAML="$CHART_DIR/values.yaml"

info "Updating Helm chart..."

# Update Chart.yaml version and appVersion
sed -i "s/^version: .*/version: ${NEW_PLATFORM_VERSION}/" "$CHART_YAML"
sed -i "s/^appVersion: .*/appVersion: \"${NEW_PLATFORM_VERSION}\"/" "$CHART_YAML"
ok "Updated Chart.yaml (version: $NEW_PLATFORM_VERSION, appVersion: $NEW_PLATFORM_VERSION)"

# Update values.yaml image tags using node for context-aware YAML editing
# (Simple sed won't work because there are 3 different tag: fields)
update_helm_values() {
    node -e "
const fs = require('fs');
const lines = fs.readFileSync('$VALUES_YAML', 'utf8').split('\n');
const updates = {};
if ('$API_CHANGED' === 'true') updates['$API_HELM_KEY'] = '$NEW_API_VERSION';
if ('$UI_CHANGED' === 'true') updates['$UI_HELM_KEY'] = '$NEW_UI_VERSION';
if ('$RELAY_CHANGED' === 'true') updates['$RELAY_HELM_KEY'] = '$NEW_RELAY_VERSION';

let currentSection = null;
let inImage = false;

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Detect top-level section (no leading whitespace)
    const sectionMatch = line.match(/^(\w[\w]*):$/);
    if (sectionMatch && !line.startsWith(' ')) {
        currentSection = sectionMatch[1];
        inImage = false;
        continue;
    }
    // Detect image: subsection (2-space indent)
    if (line.match(/^  image:$/)) {
        inImage = true;
        continue;
    }
    // Detect next 2-space section (exit image block)
    if (inImage && line.match(/^  \S/) && !line.match(/^  image:/)) {
        inImage = false;
    }
    // Update tag within the correct section's image block
    if (inImage && currentSection && updates[currentSection]) {
        const tagMatch = line.match(/^(\s+)tag:\s*.*/);
        if (tagMatch) {
            lines[i] = tagMatch[1] + 'tag: \"' + updates[currentSection] + '\"';
            delete updates[currentSection];
        }
    }
}

fs.writeFileSync('$VALUES_YAML', lines.join('\n'));
"
}

update_helm_values
ok "Updated values.yaml image tags"

# ============================================================================
# Phase 8 — Package & publish Helm chart
# ============================================================================

if [[ "$SKIP_HELM" != "true" ]]; then
    info "Packaging Helm chart..."

    helm package "$CHART_DIR" --destination "$PROJECT_ROOT/charts/"
    ok "Packaged goff-manager-${NEW_PLATFORM_VERSION}.tgz"

    info "Publishing to chart repo..."
    CHART_REPO_DIR="/tmp/helm-chart-repo"
    rm -rf "$CHART_REPO_DIR"
    git clone --depth 1 https://github.com/wspracklin/wspracklin.github.io.git "$CHART_REPO_DIR"

    cp "$PROJECT_ROOT/charts/goff-manager-${NEW_PLATFORM_VERSION}.tgz" "$CHART_REPO_DIR/charts/"
    helm repo index "$CHART_REPO_DIR/charts/" --url https://wspracklin.github.io/charts/

    cd "$CHART_REPO_DIR"
    git add charts/
    git commit -m "Add goff-manager chart v${NEW_PLATFORM_VERSION}"
    git push
    cd "$PROJECT_ROOT"
    rm -rf "$CHART_REPO_DIR"

    ok "Chart published to chart repo"
else
    info "Skipping Helm packaging & publish (--skip-helm)"
fi

# ============================================================================
# Phase 9 — Git commit & tag
# ============================================================================

info "Creating git commit and tags..."

# Check for duplicate tags
TAGS_TO_CREATE=("platform-v${NEW_PLATFORM_VERSION}")
[[ "$API_CHANGED" == "true" ]] && TAGS_TO_CREATE+=("api-v${NEW_API_VERSION}")
[[ "$UI_CHANGED" == "true" ]] && TAGS_TO_CREATE+=("ui-v${NEW_UI_VERSION}")
[[ "$RELAY_CHANGED" == "true" ]] && TAGS_TO_CREATE+=("relay-v${NEW_RELAY_VERSION}")

for tag in "${TAGS_TO_CREATE[@]}"; do
    if git tag -l "$tag" | grep -q "$tag"; then
        err "Tag $tag already exists! Aborting."
        exit 1
    fi
done

# Stage files
git add "$VERSIONS_FILE"
git add "$CHART_YAML" "$VALUES_YAML"
[[ "$API_CHANGED" == "true" ]] && git add "$PROJECT_ROOT/$API_DIR/VERSION"
[[ "$UI_CHANGED" == "true" ]] && git add "$PROJECT_ROOT/$UI_DIR/package.json"
[[ "$RELAY_CHANGED" == "true" ]] && git add "$PROJECT_ROOT/$RELAY_DIR/VERSION"

# Build commit message body
COMMIT_BODY=""
[[ "$API_CHANGED" == "true" ]] && COMMIT_BODY+="- api: v${API_VERSION} → v${NEW_API_VERSION}\n"
[[ "$UI_CHANGED" == "true" ]] && COMMIT_BODY+="- ui: v${UI_VERSION} → v${NEW_UI_VERSION}\n"
[[ "$RELAY_CHANGED" == "true" ]] && COMMIT_BODY+="- relay: v${RELAY_VERSION} → v${NEW_RELAY_VERSION}\n"
[[ "$CHART_CHANGED" == "true" && "$ANY_COMPONENT_CHANGED" == "false" ]] && COMMIT_BODY+="- chart-only update\n"

git commit -m "Release platform v${NEW_PLATFORM_VERSION}" -m "$(echo -e "$COMMIT_BODY")"
ok "Created commit"

# Create tags
for tag in "${TAGS_TO_CREATE[@]}"; do
    git tag "$tag"
    ok "Created tag: $tag"
done

# ============================================================================
# Done
# ============================================================================

echo ""
echo -e "${BOLD}============================================${NC}"
echo -e "${GREEN}${BOLD}  Release complete!${NC}"
echo -e "${BOLD}============================================${NC}"
echo ""
echo -e "  Platform:  ${GREEN}v${NEW_PLATFORM_VERSION}${NC}"
[[ "$API_CHANGED" == "true" ]] && echo -e "  API:       ${GREEN}v${NEW_API_VERSION}${NC}"
[[ "$UI_CHANGED" == "true" ]] && echo -e "  UI:        ${GREEN}v${NEW_UI_VERSION}${NC}"
[[ "$RELAY_CHANGED" == "true" ]] && echo -e "  Relay:     ${GREEN}v${NEW_RELAY_VERSION}${NC}"
echo ""
echo -e "  Tags created: ${CYAN}${TAGS_TO_CREATE[*]}${NC}"
echo ""
echo -e "  ${YELLOW}Don't forget to push:${NC}"
echo -e "    git push origin main --tags"
echo ""
