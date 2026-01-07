# Local Kubernetes Development Script for Windows
# Uses k3d to run a local K8s cluster that mirrors production

param(
    [Parameter(Position=0)]
    [ValidateSet("start", "stop", "delete", "rebuild", "logs", "status", "help")]
    [string]$Command = "help",

    [Parameter(Position=1)]
    [string]$Service = "all"
)

$ErrorActionPreference = "Stop"
$ClusterName = "goff-local"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

function Test-Dependencies {
    $missing = @()

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $missing += "docker" }
    if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { $missing += "kubectl" }
    if (-not (Get-Command k3d -ErrorAction SilentlyContinue)) { $missing += "k3d" }

    if ($missing.Count -gt 0) {
        Write-Err "Missing dependencies: $($missing -join ', ')"
        Write-Host ""
        Write-Host "Install with:"
        Write-Host "  choco install docker-desktop kubectl k3d"
        Write-Host "  # or"
        Write-Host "  winget install Docker.DockerDesktop Kubernetes.kubectl k3d-io.k3d"
        exit 1
    }
}

function New-Cluster {
    $clusters = k3d cluster list 2>&1
    if ($clusters -match $ClusterName) {
        Write-Info "Cluster '$ClusterName' already exists"
        return
    }

    Write-Info "Creating k3d cluster '$ClusterName'..."
    k3d cluster create $ClusterName `
        --port "4000:4000@server:0" `
        --port "8095:8095@server:0" `
        --port "1031:1031@server:0" `
        --port "30600:30600@server:0" `
        --port "30895:30895@server:0" `
        --port "31031:31031@server:0" `
        --agents 0 `
        --wait

    Write-Info "Cluster created successfully"
}

function Build-Images {
    Write-Info "Building Docker images..."

    Write-Info "Building flag-manager-api..."
    docker build -t flag-manager-api:local "$ProjectRoot\flag-manager-api"

    Write-Info "Building goff-ui..."
    docker build -t goff-ui:local "$ProjectRoot\goff-ui"

    Write-Info "Images built successfully"
}

function Import-Images {
    Write-Info "Importing images into k3d cluster..."

    k3d image import flag-manager-api:local -c $ClusterName
    k3d image import goff-ui:local -c $ClusterName

    Write-Info "Images imported successfully"
}

function Deploy-App {
    Write-Info "Deploying to Kubernetes..."

    kubectl apply -k "$ProjectRoot\k8s\local\"

    Write-Info "Waiting for deployments to be ready..."
    kubectl -n feature-flags wait --for=condition=available deployment/flag-manager-api --timeout=120s
    kubectl -n feature-flags wait --for=condition=available deployment/go-feature-flag --timeout=120s
    kubectl -n feature-flags wait --for=condition=available deployment/goff-ui --timeout=120s

    Write-Info "Deployment complete!"
}

function Show-Urls {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  GO Feature Flag UI - Local Development" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Frontend:         " -NoNewline; Write-Host "http://localhost:4000" -ForegroundColor Yellow
    Write-Host "  Flag Manager API: " -NoNewline; Write-Host "http://localhost:8095" -ForegroundColor Yellow
    Write-Host "  Relay Proxy:      " -NoNewline; Write-Host "http://localhost:1031" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  View pods:"
    Write-Host "    kubectl -n feature-flags get pods"
    Write-Host ""
    Write-Host "  View logs:"
    Write-Host "    .\scripts\local-dev.ps1 logs ui"
    Write-Host "    .\scripts\local-dev.ps1 logs api"
    Write-Host "    .\scripts\local-dev.ps1 logs relay"
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
}

function Start-LocalCluster {
    $clusters = k3d cluster list 2>&1

    if ($clusters -match "$ClusterName.*running") {
        Write-Info "Cluster '$ClusterName' is already running"
    }
    elseif ($clusters -match $ClusterName) {
        Write-Info "Starting existing cluster '$ClusterName'..."
        k3d cluster start $ClusterName
    }
    else {
        New-Cluster
        Build-Images
        Import-Images
        Deploy-App
    }

    kubectl config use-context "k3d-$ClusterName"
    Show-Urls
}

function Stop-LocalCluster {
    Write-Info "Stopping cluster '$ClusterName'..."
    k3d cluster stop $ClusterName
    Write-Info "Cluster stopped. Use 'start' to resume."
}

function Remove-LocalCluster {
    Write-Info "Deleting cluster '$ClusterName'..."
    k3d cluster delete $ClusterName
    Write-Info "Cluster deleted."
}

function Invoke-Rebuild {
    Write-Info "Rebuilding and redeploying..."
    Build-Images
    Import-Images

    kubectl -n feature-flags rollout restart deployment/flag-manager-api
    kubectl -n feature-flags rollout restart deployment/goff-ui

    kubectl -n feature-flags rollout status deployment/flag-manager-api
    kubectl -n feature-flags rollout status deployment/goff-ui

    Write-Info "Rebuild complete!"
    Show-Urls
}

function Show-Logs {
    switch ($Service) {
        "ui" { kubectl -n feature-flags logs -f deployment/goff-ui }
        "frontend" { kubectl -n feature-flags logs -f deployment/goff-ui }
        "api" { kubectl -n feature-flags logs -f deployment/flag-manager-api }
        "flag-manager" { kubectl -n feature-flags logs -f deployment/flag-manager-api }
        "relay" { kubectl -n feature-flags logs -f deployment/go-feature-flag }
        "proxy" { kubectl -n feature-flags logs -f deployment/go-feature-flag }
        "all" { kubectl -n feature-flags logs -f -l app.kubernetes.io/part-of=feature-flags --max-log-requests=10 }
        default {
            Write-Err "Unknown service: $Service"
            Write-Host "Usage: .\local-dev.ps1 logs [ui|api|relay|all]"
        }
    }
}

function Show-Status {
    Write-Host ""
    Write-Host "Cluster Status:"
    k3d cluster list
    Write-Host ""
    Write-Host "Pods:"
    try {
        kubectl -n feature-flags get pods
    } catch {
        Write-Host "  Namespace not found or cluster not running"
    }
    Write-Host ""
    Write-Host "Services:"
    try {
        kubectl -n feature-flags get svc
    } catch {
        Write-Host "  Namespace not found or cluster not running"
    }
}

function Show-Help {
    Write-Host "Usage: .\local-dev.ps1 <command>"
    Write-Host ""
    Write-Host "Commands:"
    Write-Host "  start     Create cluster and deploy (or start existing)"
    Write-Host "  stop      Stop the cluster (preserves state)"
    Write-Host "  delete    Delete the cluster entirely"
    Write-Host "  rebuild   Rebuild images and redeploy"
    Write-Host "  logs      View logs (ui|api|relay|all)"
    Write-Host "  status    Show cluster and pod status"
    Write-Host "  help      Show this help"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "  .\local-dev.ps1 start          # Start local development"
    Write-Host "  .\local-dev.ps1 rebuild        # After code changes"
    Write-Host "  .\local-dev.ps1 logs ui        # View frontend logs"
    Write-Host "  .\local-dev.ps1 stop           # Stop for the day"
}

# Main
Test-Dependencies

switch ($Command) {
    "start" { Start-LocalCluster }
    "stop" { Stop-LocalCluster }
    "delete" { Remove-LocalCluster }
    "rebuild" { Invoke-Rebuild }
    "logs" { Show-Logs }
    "status" { Show-Status }
    "help" { Show-Help }
    default { Show-Help }
}
