<#
.SYNOPSIS
    Unified Release Script for GO Feature Flag Manager (PowerShell)

.DESCRIPTION
    Detects changes, builds Docker images, updates Helm charts, creates git tags.
    Native PowerShell port of scripts/release.sh — identical behavior, same CLI flags.

.PARAMETER BumpType
    Version bump type: patch (default), minor, or major

.PARAMETER DryRun
    Preview what would happen, no side effects

.PARAMETER Only
    Only release specific component(s): api, ui, relay (repeatable)

.PARAMETER Force
    Skip change detection, release specified components regardless

.PARAMETER SkipHelm
    Skip Helm chart packaging and chart repo push

.PARAMETER SkipDocker
    Skip Docker build and push

.EXAMPLE
    .\scripts\release.ps1 -DryRun
    Preview release of all changed components

.EXAMPLE
    .\scripts\release.ps1 -DryRun -Only api
    Preview release of API component only

.EXAMPLE
    .\scripts\release.ps1 minor -Only api,ui
    Release API and UI with a minor version bump
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$BumpType = 'patch',

    [switch]$DryRun,

    [string[]]$Only,

    [switch]$Force,

    [switch]$SkipHelm,

    [switch]$SkipDocker
)

$ErrorActionPreference = 'Stop'

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir

# UTF-8 without BOM — PowerShell 5.1's -Encoding UTF8 writes a BOM that breaks JSON parsers
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

# --- Color helpers ---
function Write-Info  { param([string]$Message) Write-Host "[INFO] "  -ForegroundColor Blue   -NoNewline; Write-Host $Message }
function Write-Ok    { param([string]$Message) Write-Host "[OK] "    -ForegroundColor Green  -NoNewline; Write-Host $Message }
function Write-Warn  { param([string]$Message) Write-Host "[WARN] "  -ForegroundColor Yellow -NoNewline; Write-Host $Message }
function Write-Err   { param([string]$Message) Write-Host "[ERROR] " -ForegroundColor Red    -NoNewline; Write-Host $Message }

# ============================================================================
# Phase 0 - Prerequisites
# ============================================================================

function Test-Prereqs {
    $missing = @()

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        $missing += 'git'
    }

    if (-not $SkipDocker -and -not (Get-Command docker -ErrorAction SilentlyContinue)) {
        $missing += 'docker (or use -SkipDocker)'
    }

    if (-not $SkipHelm -and -not (Get-Command helm -ErrorAction SilentlyContinue)) {
        $missing += 'helm (or use -SkipHelm)'
    }

    if ($missing.Count -gt 0) {
        Write-Err 'Missing required tools:'
        foreach ($tool in $missing) {
            Write-Host "  - $tool"
        }
        exit 1
    }
}

Test-Prereqs

# ============================================================================
# Phase 1 - Read versions.json
# ============================================================================

$VersionsFile = Join-Path $ProjectRoot 'versions.json'

if (-not (Test-Path $VersionsFile)) {
    Write-Err "versions.json not found at $VersionsFile"
    exit 1
}

$versions = Get-Content $VersionsFile -Raw | ConvertFrom-Json

$PlatformVersion = $versions.platform

$ApiVersion  = $versions.components.api.version
$ApiDir      = $versions.components.api.dir
$ApiImage    = $versions.components.api.image
$ApiHelmKey  = $versions.components.api.helmKey

$UiVersion   = $versions.components.ui.version
$UiDir       = $versions.components.ui.dir
$UiImage     = $versions.components.ui.image
$UiHelmKey   = $versions.components.ui.helmKey

$RelayVersion  = $versions.components.relay.version
$RelayDir      = $versions.components.relay.dir
$RelayImage    = $versions.components.relay.image
$RelayHelmKey  = $versions.components.relay.helmKey

Write-Info "Loaded versions.json (platform: v${PlatformVersion})"

# ============================================================================
# Phase 2 - Detect changes via git diff
# ============================================================================

Push-Location $ProjectRoot
try {

# Find the latest platform tag as comparison base
$LatestTag = git tag -l 'platform-v*' --sort=-v:refname 2>$null | Select-Object -First 1

if (-not $LatestTag) {
    Write-Info 'No previous platform-v* tag found - treating all components as changed (first release)'
    $DiffBase = git rev-list --max-parents=0 HEAD | Select-Object -First 1
} else {
    Write-Info "Comparing against tag: $LatestTag"
    $DiffBase = $LatestTag
}

function Test-ComponentChanged {
    param([string]$Dir)
    $result = git diff --quiet "${DiffBase}..HEAD" -- "$Dir/" 2>$null
    return ($LASTEXITCODE -ne 0)
}

$ApiChanged   = Test-ComponentChanged $ApiDir
$UiChanged    = Test-ComponentChanged $UiDir
$RelayChanged = Test-ComponentChanged $RelayDir
$ChartChanged = Test-ComponentChanged 'charts/goff-manager'

# Apply -Only filter
if ($Only.Count -gt 0) {
    if ($Only -notcontains 'api')   { $ApiChanged   = $false }
    if ($Only -notcontains 'ui')    { $UiChanged    = $false }
    if ($Only -notcontains 'relay') { $RelayChanged = $false }
}

# Apply -Force override
if ($Force) {
    if ($Only.Count -gt 0) {
        foreach ($comp in $Only) {
            switch ($comp) {
                'api'   { $ApiChanged   = $true }
                'ui'    { $UiChanged    = $true }
                'relay' { $RelayChanged = $true }
                default { Write-Warn "Unknown component: $comp" }
            }
        }
    } else {
        $ApiChanged   = $true
        $UiChanged    = $true
        $RelayChanged = $true
    }
}

$AnyComponentChanged = ($ApiChanged -or $UiChanged -or $RelayChanged)

if (-not $AnyComponentChanged -and -not $ChartChanged) {
    Write-Info "No changes detected since $LatestTag. Nothing to release."
    Write-Info 'Use -Force to release anyway.'
    exit 0
}

# ============================================================================
# Phase 3 - Compute new versions
# ============================================================================

function Get-BumpedVersion {
    param(
        [string]$Version,
        [string]$Bump
    )
    $parts = $Version.Split('.')
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    switch ($Bump) {
        'patch' { return "$major.$minor.$($patch + 1)" }
        'minor' { return "$major.$($minor + 1).0" }
        'major' { return "$($major + 1).0.0" }
    }
}

$NewApiVersion      = $ApiVersion
$NewUiVersion       = $UiVersion
$NewRelayVersion    = $RelayVersion
$NewPlatformVersion = $PlatformVersion

if ($ApiChanged)   { $NewApiVersion   = Get-BumpedVersion $ApiVersion   $BumpType }
if ($UiChanged)    { $NewUiVersion    = Get-BumpedVersion $UiVersion    $BumpType }
if ($RelayChanged) { $NewRelayVersion = Get-BumpedVersion $RelayVersion $BumpType }

if ($AnyComponentChanged -or $ChartChanged) {
    $NewPlatformVersion = Get-BumpedVersion $PlatformVersion $BumpType
}

# ============================================================================
# Phase 4 - Preview & confirm
# ============================================================================

function Write-ComponentStatus {
    param(
        [string]$Name,
        [bool]$Changed,
        [string]$OldVer,
        [string]$NewVer
    )
    $label = $Name.PadRight(10)
    if ($Changed) {
        Write-Host "  $label " -NoNewline
        Write-Host '[CHANGED]' -ForegroundColor Green -NoNewline
        Write-Host "  v$($OldVer.PadRight(8)) -> " -NoNewline
        Write-Host "v$NewVer" -ForegroundColor Green
    } else {
        Write-Host "  $label " -NoNewline
        Write-Host '[SKIP]' -ForegroundColor Yellow -NoNewline
        Write-Host "     v$($OldVer.PadRight(8))   (unchanged)"
    }
}

Write-Host ''
Write-Host '============================================' -ForegroundColor White
Write-Host '  Release Preview' -ForegroundColor White
Write-Host '============================================' -ForegroundColor White
Write-Host ''
Write-Host '  Bump type:  ' -NoNewline; Write-Host $BumpType -ForegroundColor Cyan
Write-Host '  Platform:   ' -NoNewline; Write-Host "v$PlatformVersion" -ForegroundColor Cyan -NoNewline
Write-Host ' -> ' -NoNewline; Write-Host "v$NewPlatformVersion" -ForegroundColor Green
Write-Host ''

Write-ComponentStatus 'API'   $ApiChanged   $ApiVersion   $NewApiVersion
Write-ComponentStatus 'UI'    $UiChanged    $UiVersion    $NewUiVersion
Write-ComponentStatus 'Relay' $RelayChanged $RelayVersion $NewRelayVersion

if ($ChartChanged -and -not $AnyComponentChanged) {
    Write-Host ''
    Write-Host '  Chart-only change detected' -ForegroundColor Cyan -NoNewline
    Write-Host ' - no component versions bumped'
}

Write-Host ''
Write-Host '  Docker:     ' -NoNewline
if ($SkipDocker) { Write-Host 'SKIP' -ForegroundColor Yellow } else { Write-Host 'enabled' -ForegroundColor Green }
Write-Host '  Helm:       ' -NoNewline
if ($SkipHelm)   { Write-Host 'SKIP' -ForegroundColor Yellow } else { Write-Host 'enabled' -ForegroundColor Green }
Write-Host ''

if ($DryRun) {
    Write-Host '[DRY RUN] No changes will be made.' -ForegroundColor Yellow
    exit 0
}

# Check for dirty working tree
$dirty = $false
git diff --quiet HEAD 2>$null
if ($LASTEXITCODE -ne 0) { $dirty = $true }
$untracked = git ls-files --others --exclude-standard
if ($untracked) { $dirty = $true }

if ($dirty) {
    Write-Warn 'Working tree has uncommitted changes.'
    $confirm = Read-Host 'Continue anyway? (y/N)'
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host 'Aborted.'
        exit 1
    }
}

$confirm = Read-Host 'Proceed with release? (y/N)'
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host 'Aborted.'
    exit 1
}

# ============================================================================
# Phase 5 - Update version files
# ============================================================================

Write-Info 'Updating version files...'

# Update versions.json
$versions.platform = $NewPlatformVersion
$versions.components.api.version   = $NewApiVersion
$versions.components.ui.version    = $NewUiVersion
$versions.components.relay.version = $NewRelayVersion
[System.IO.File]::WriteAllText($VersionsFile, (($versions | ConvertTo-Json -Depth 10) + "`n"), $Utf8NoBom)
Write-Ok 'Updated versions.json'

# Update component version files
if ($ApiChanged) {
    $versionFilePath = Join-Path (Join-Path $ProjectRoot $ApiDir) 'VERSION'
    [System.IO.File]::WriteAllText($versionFilePath, $NewApiVersion, $Utf8NoBom)
    Write-Ok "Updated $ApiDir/VERSION -> $NewApiVersion"
}

if ($UiChanged) {
    $packageJsonPath = Join-Path (Join-Path $ProjectRoot $UiDir) 'package.json'
    $pkg = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $pkg.version = $NewUiVersion
    [System.IO.File]::WriteAllText($packageJsonPath, (($pkg | ConvertTo-Json -Depth 10) + "`n"), $Utf8NoBom)
    Write-Ok "Updated $UiDir/package.json version -> $NewUiVersion"
}

if ($RelayChanged) {
    $versionFilePath = Join-Path (Join-Path $ProjectRoot $RelayDir) 'VERSION'
    [System.IO.File]::WriteAllText($versionFilePath, $NewRelayVersion, $Utf8NoBom)
    Write-Ok "Updated $RelayDir/VERSION -> $NewRelayVersion"
}

# ============================================================================
# Phase 6 - Docker build & push
# ============================================================================

if (-not $SkipDocker) {
    Write-Info 'Building and pushing Docker images...'

    function Invoke-DockerBuildPush {
        param(
            [string]$Image,
            [string]$Version,
            [string]$Dir,
            [string]$Name
        )
        $context = Join-Path $ProjectRoot $Dir
        Write-Info "Building $Name ($Image`:$Version)..."
        docker build -t "${Image}:${Version}" -t "${Image}:latest" $context
        if ($LASTEXITCODE -ne 0) { throw "Docker build failed for $Name" }
        Write-Info "Pushing $Image`:$Version..."
        docker push "${Image}:${Version}"
        if ($LASTEXITCODE -ne 0) { throw "Docker push failed for $Name ($Version)" }
        docker push "${Image}:latest"
        if ($LASTEXITCODE -ne 0) { throw "Docker push failed for $Name (latest)" }
        Write-Ok "$Name ${Image}:${Version} pushed"
    }

    if ($ApiChanged)   { Invoke-DockerBuildPush $ApiImage   $NewApiVersion   $ApiDir   'API'   }
    if ($UiChanged)    { Invoke-DockerBuildPush $UiImage    $NewUiVersion    $UiDir    'UI'    }
    if ($RelayChanged) { Invoke-DockerBuildPush $RelayImage $NewRelayVersion $RelayDir 'Relay' }

    # --- Push Docker Hub READMEs ---
    $dockerHubDir = Join-Path $ProjectRoot 'dockerhub'
    $readmeMap = @{
        $ApiImage   = Join-Path (Join-Path $dockerHubDir 'flag-manager-api') 'README.md'
        $UiImage    = Join-Path (Join-Path $dockerHubDir 'goff-ui')          'README.md'
        $RelayImage = Join-Path (Join-Path $dockerHubDir 'go-feature-flag')  'README.md'
    }

    # Authenticate with Docker Hub (reuse existing docker login credentials)
    $tokenResponse = $null
    $dockerConfig = Join-Path (Join-Path $env:USERPROFILE '.docker') 'config.json'
    if (Test-Path $dockerConfig) {
        $config = Get-Content $dockerConfig -Raw | ConvertFrom-Json
        $hubAuth = $null
        if ($config.auths -and $config.auths.'https://index.docker.io/v1/') {
            $hubAuth = $config.auths.'https://index.docker.io/v1/'.auth
        }
        if ($hubAuth) {
            $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($hubAuth))
            $parts = $decoded.Split(':', 2)
            $loginBody = @{ username = $parts[0]; password = $parts[1] } | ConvertTo-Json
            try {
                $tokenResponse = Invoke-RestMethod -Uri 'https://hub.docker.com/v2/users/login/' `
                    -Method Post -ContentType 'application/json' -Body $loginBody
            } catch {
                Write-Warn "Docker Hub login failed - skipping README push: $_"
            }
        } else {
            Write-Warn 'No Docker Hub credentials found in docker config - skipping README push'
        }
    } else {
        Write-Warn 'No docker config found - skipping README push'
    }

    if ($tokenResponse) {
        $headers = @{ Authorization = "Bearer $($tokenResponse.token)" }

        foreach ($image in $readmeMap.Keys) {
            $readmePath = $readmeMap[$image]
            if (-not (Test-Path $readmePath)) {
                Write-Warn "README not found at $readmePath - skipping"
                continue
            }
            # image is "namespace/repo" — split for the API URL
            $ns, $repo = $image.Split('/', 2)
            $readmeContent = Get-Content $readmePath -Raw
            $body = @{ full_description = $readmeContent } | ConvertTo-Json -Depth 2
            try {
                Invoke-RestMethod -Uri "https://hub.docker.com/v2/repositories/${ns}/${repo}/" `
                    -Method Patch -ContentType 'application/json' -Headers $headers -Body $body | Out-Null
                Write-Ok "Pushed README for $image"
            } catch {
                Write-Warn "Failed to push README for ${image}: $_"
            }
        }
    }
} else {
    Write-Info 'Skipping Docker build & push (-SkipDocker)'
}

# ============================================================================
# Phase 7 - Update Helm chart
# ============================================================================

$ChartDir   = Join-Path (Join-Path $ProjectRoot 'charts') 'goff-manager'
$ChartYaml  = Join-Path $ChartDir 'Chart.yaml'
$ValuesYaml = Join-Path $ChartDir 'values.yaml'

Write-Info 'Updating Helm chart...'

# Update Chart.yaml version and appVersion
$chartContent = Get-Content $ChartYaml -Raw
$chartContent = $chartContent -replace '(?m)^version: .*', "version: $NewPlatformVersion"
$chartContent = $chartContent -replace '(?m)^appVersion: .*', "appVersion: `"$NewPlatformVersion`""
[System.IO.File]::WriteAllText($ChartYaml, $chartContent, $Utf8NoBom)
Write-Ok "Updated Chart.yaml (version: $NewPlatformVersion, appVersion: $NewPlatformVersion)"

# Update values.yaml image tags (context-aware YAML editing)
# Same section-tracking line-by-line approach as the node.js version in release.sh
$updates = @{}
if ($ApiChanged)   { $updates[$ApiHelmKey]   = $NewApiVersion }
if ($UiChanged)    { $updates[$UiHelmKey]    = $NewUiVersion }
if ($RelayChanged) { $updates[$RelayHelmKey] = $NewRelayVersion }

if ($updates.Count -gt 0) {
    $lines = Get-Content $ValuesYaml
    $currentSection = $null
    $inImage = $false

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]

        # Detect top-level section (no leading whitespace)
        if ($line -match '^(\w[\w]*):\s*$' -and $line -notmatch '^\s') {
            $currentSection = $Matches[1]
            $inImage = $false
            continue
        }

        # Detect image: subsection (2-space indent)
        if ($line -match '^  image:\s*$') {
            $inImage = $true
            continue
        }

        # Detect next 2-space key (exit image block)
        if ($inImage -and $line -match '^  \S' -and $line -notmatch '^  image:') {
            $inImage = $false
        }

        # Update tag within the correct section's image block
        if ($inImage -and $currentSection -and $updates.ContainsKey($currentSection)) {
            if ($line -match '^(\s+)tag:\s*.*') {
                $indent = $Matches[1]
                $lines[$i] = "${indent}tag: `"$($updates[$currentSection])`""
                $updates.Remove($currentSection)
            }
        }
    }

    [System.IO.File]::WriteAllText($ValuesYaml, (($lines -join "`n") + "`n"), $Utf8NoBom)
}
Write-Ok 'Updated values.yaml image tags'

# ============================================================================
# Phase 8 - Package & publish Helm chart
# ============================================================================

if (-not $SkipHelm) {
    Write-Info 'Packaging Helm chart...'

    $chartsOutputDir = Join-Path $ProjectRoot 'charts'
    helm package $ChartDir --destination $chartsOutputDir
    if ($LASTEXITCODE -ne 0) { throw 'Helm package failed' }
    Write-Ok "Packaged goff-manager-${NewPlatformVersion}.tgz"

    Write-Info 'Publishing to chart repo...'
    $ChartRepoDir = Join-Path ([System.IO.Path]::GetTempPath()) 'helm-chart-repo'
    if (Test-Path $ChartRepoDir) { Remove-Item $ChartRepoDir -Recurse -Force }
    git clone --depth 1 https://github.com/wspracklin/wspracklin.github.io.git $ChartRepoDir
    if ($LASTEXITCODE -ne 0) { throw 'Failed to clone chart repo' }

    $tgzFile = Join-Path $chartsOutputDir "goff-manager-${NewPlatformVersion}.tgz"
    Copy-Item $tgzFile (Join-Path $ChartRepoDir 'charts')

    helm repo index (Join-Path $ChartRepoDir 'charts') --url https://wspracklin.github.io/charts/
    if ($LASTEXITCODE -ne 0) { throw 'Helm repo index failed' }

    Push-Location $ChartRepoDir
    try {
        git add charts/
        git commit -m "Add goff-manager chart v${NewPlatformVersion}"
        if ($LASTEXITCODE -ne 0) { throw 'Git commit failed in chart repo' }
        git push
        if ($LASTEXITCODE -ne 0) { throw 'Git push failed for chart repo' }
    } finally {
        Pop-Location
    }
    Remove-Item $ChartRepoDir -Recurse -Force

    Write-Ok 'Chart published to chart repo'
} else {
    Write-Info 'Skipping Helm packaging & publish (-SkipHelm)'
}

# ============================================================================
# Phase 9 - Git commit & tag
# ============================================================================

Write-Info 'Creating git commit and tags...'

# Check for duplicate tags
$TagsToCreate = @("platform-v${NewPlatformVersion}")
if ($ApiChanged)   { $TagsToCreate += "api-v${NewApiVersion}" }
if ($UiChanged)    { $TagsToCreate += "ui-v${NewUiVersion}" }
if ($RelayChanged) { $TagsToCreate += "relay-v${NewRelayVersion}" }

foreach ($tag in $TagsToCreate) {
    $existing = git tag -l $tag
    if ($existing) {
        Write-Err "Tag $tag already exists! Aborting."
        exit 1
    }
}

# Stage files
git add $VersionsFile
git add $ChartYaml $ValuesYaml
if ($ApiChanged)   { git add (Join-Path (Join-Path $ProjectRoot $ApiDir) 'VERSION') }
if ($UiChanged)    { git add (Join-Path (Join-Path $ProjectRoot $UiDir) 'package.json') }
if ($RelayChanged) { git add (Join-Path (Join-Path $ProjectRoot $RelayDir) 'VERSION') }

# Build commit message body
$commitBody = ''
if ($ApiChanged)   { $commitBody += "- api: v${ApiVersion} -> v${NewApiVersion}`n" }
if ($UiChanged)    { $commitBody += "- ui: v${UiVersion} -> v${NewUiVersion}`n" }
if ($RelayChanged) { $commitBody += "- relay: v${RelayVersion} -> v${NewRelayVersion}`n" }
if ($ChartChanged -and -not $AnyComponentChanged) { $commitBody += "- chart-only update`n" }

git commit -m "Release platform v${NewPlatformVersion}" -m $commitBody
if ($LASTEXITCODE -ne 0) { throw 'Git commit failed' }
Write-Ok 'Created commit'

# Create tags
foreach ($tag in $TagsToCreate) {
    git tag $tag
    if ($LASTEXITCODE -ne 0) { throw "Failed to create tag: $tag" }
    Write-Ok "Created tag: $tag"
}

# ============================================================================
# Done
# ============================================================================

Write-Host ''
Write-Host '============================================' -ForegroundColor White
Write-Host '  Release complete!' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor White
Write-Host ''
Write-Host "  Platform:  " -NoNewline; Write-Host "v$NewPlatformVersion" -ForegroundColor Green
if ($ApiChanged)   { Write-Host "  API:       " -NoNewline; Write-Host "v$NewApiVersion"   -ForegroundColor Green }
if ($UiChanged)    { Write-Host "  UI:        " -NoNewline; Write-Host "v$NewUiVersion"    -ForegroundColor Green }
if ($RelayChanged) { Write-Host "  Relay:     " -NoNewline; Write-Host "v$NewRelayVersion" -ForegroundColor Green }
Write-Host ''
Write-Host "  Tags created: " -NoNewline; Write-Host ($TagsToCreate -join ' ') -ForegroundColor Cyan
Write-Host ''
Write-Host "  Don't forget to push:" -ForegroundColor Yellow
Write-Host '    git push origin main --tags'
Write-Host ''

} finally {
    Pop-Location
}
