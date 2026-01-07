# Tiltfile for local Kubernetes development
# Provides live updates and a nice dashboard

# Use local k3d cluster
allow_k8s_contexts('k3d-goff-local')

# Build Flag Manager API
docker_build(
    'flag-manager-api',
    './flag-manager-api',
    dockerfile='./flag-manager-api/Dockerfile',
    live_update=[
        sync('./flag-manager-api', '/app'),
        run('go build -o flag-manager-api .', trigger=['./flag-manager-api/*.go']),
    ]
)

# Build Frontend
docker_build(
    'goff-ui',
    './goff-ui',
    dockerfile='./goff-ui/Dockerfile',
    live_update=[
        sync('./goff-ui/src', '/app/src'),
        sync('./goff-ui/public', '/app/public'),
    ]
)

# Deploy using kustomize
k8s_yaml(kustomize('./k8s/local'))

# Configure resources
k8s_resource(
    'goff-ui',
    port_forwards=['6000:3000'],
    labels=['frontend']
)

k8s_resource(
    'flag-manager-api',
    port_forwards=['8095:8095'],
    labels=['api']
)

k8s_resource(
    'go-feature-flag',
    port_forwards=['1031:1031'],
    labels=['relay-proxy']
)

# Group resources
config.define_string_list('to-run', args=True)
cfg = config.parse()
groups = {
    'all': ['goff-ui', 'flag-manager-api', 'go-feature-flag'],
    'api': ['flag-manager-api', 'go-feature-flag'],
    'ui': ['goff-ui'],
}
