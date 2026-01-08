<#
.SYNOPSIS
    Build and import Docker images into k3d cluster

.DESCRIPTION
    This script builds the Docker images for the GO Feature Flag Manager
    and imports them into the k3d cluster for local development.

.PARAMETER ClusterName
    Name of the k3d cluster (default: goff-local)

.PARAMETER Tag
    Image tag to use (default: latest)

.PARAMETER SkipBuild
    Skip building images, only import existing ones

.EXAMPLE
    .\build-and-import.ps1

.EXAMPLE
    .\build-and-import.ps1 -ClusterName my-cluster -Tag v1.0.0
#>

param(
    [string]$ClusterName = "goff-local",
    [string]$Tag = "latest",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Image names
$API_IMAGE = "goff-manager-api:$Tag"
$UI_IMAGE = "goff-manager-ui:$Tag"

# Get script directory and project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "GO Feature Flag Manager - Build & Import" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cluster: $ClusterName" -ForegroundColor Yellow
Write-Host "Tag: $Tag" -ForegroundColor Yellow
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Yellow
Write-Host ""

# Check if k3d is installed
if (-not (Get-Command k3d -ErrorAction SilentlyContinue)) {
    Write-Host "Error: k3d is not installed. Please install it first:" -ForegroundColor Red
    Write-Host "  choco install k3d" -ForegroundColor Gray
    Write-Host "  or visit: https://k3d.io/" -ForegroundColor Gray
    exit 1
}

# Check if Docker is running
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Error: Docker is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

try {
    docker info | Out-Null
} catch {
    Write-Host "Error: Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

# Check if cluster exists
$clusters = k3d cluster list -o json | ConvertFrom-Json
$clusterExists = $clusters | Where-Object { $_.name -eq $ClusterName }

if (-not $clusterExists) {
    Write-Host "Cluster '$ClusterName' not found. Creating it..." -ForegroundColor Yellow
    k3d cluster create $ClusterName --agents 1
    Write-Host "Cluster created successfully!" -ForegroundColor Green
}

# Build images
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "Building Docker images..." -ForegroundColor Cyan
    Write-Host ""

    # Build API image
    Write-Host "Building API image: $API_IMAGE" -ForegroundColor Yellow
    $apiPath = Join-Path $ProjectRoot "flag-manager-api-simple"
    if (-not (Test-Path $apiPath)) {
        Write-Host "Error: API directory not found at $apiPath" -ForegroundColor Red
        exit 1
    }

    Push-Location $apiPath
    try {
        docker build -t $API_IMAGE .
        if ($LASTEXITCODE -ne 0) { throw "API build failed" }
        Write-Host "API image built successfully!" -ForegroundColor Green
    } finally {
        Pop-Location
    }

    Write-Host ""

    # Build UI image
    Write-Host "Building UI image: $UI_IMAGE" -ForegroundColor Yellow
    $uiPath = Join-Path $ProjectRoot "goff-ui"
    if (-not (Test-Path $uiPath)) {
        Write-Host "Error: UI directory not found at $uiPath" -ForegroundColor Red
        exit 1
    }

    Push-Location $uiPath
    try {
        docker build -t $UI_IMAGE .
        if ($LASTEXITCODE -ne 0) { throw "UI build failed" }
        Write-Host "UI image built successfully!" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Skipping build (using existing images)..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Importing images into k3d cluster..." -ForegroundColor Cyan
Write-Host ""

# Import images into k3d
Write-Host "Importing $API_IMAGE..." -ForegroundColor Yellow
k3d image import $API_IMAGE -c $ClusterName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to import API image" -ForegroundColor Yellow
}

Write-Host "Importing $UI_IMAGE..." -ForegroundColor Yellow
k3d image import $UI_IMAGE -c $ClusterName
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: Failed to import UI image" -ForegroundColor Yellow
}

# Also import the relay proxy image if not already present
Write-Host "Pulling and importing gofeatureflag/go-feature-flag:latest..." -ForegroundColor Yellow
docker pull gofeatureflag/go-feature-flag:latest
k3d image import gofeatureflag/go-feature-flag:latest -c $ClusterName

Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "Build and import completed!" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Images imported into cluster '$ClusterName':" -ForegroundColor Cyan
Write-Host "  - $API_IMAGE" -ForegroundColor White
Write-Host "  - $UI_IMAGE" -ForegroundColor White
Write-Host "  - gofeatureflag/go-feature-flag:latest" -ForegroundColor White
Write-Host ""
Write-Host "To deploy with Helm, run:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  helm install goff-manager ./charts/goff-manager \" -ForegroundColor Gray
Write-Host "    --set api.image.repository=goff-manager-api \" -ForegroundColor Gray
Write-Host "    --set api.image.tag=$Tag \" -ForegroundColor Gray
Write-Host "    --set api.image.pullPolicy=Never \" -ForegroundColor Gray
Write-Host "    --set ui.image.repository=goff-manager-ui \" -ForegroundColor Gray
Write-Host "    --set ui.image.tag=$Tag \" -ForegroundColor Gray
Write-Host "    --set ui.image.pullPolicy=Never \" -ForegroundColor Gray
Write-Host "    --set ui.env.devMode=true" -ForegroundColor Gray
Write-Host ""
Write-Host "Or use the values file:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  helm install goff-manager ./charts/goff-manager -f ./charts/goff-manager/values-local.yaml" -ForegroundColor Gray
Write-Host ""
