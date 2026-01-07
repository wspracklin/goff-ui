#!/bin/bash
# Deploy GO Feature Flag UI to AWS EC2
# Usage: ./deploy-aws.sh <EC2_IP> <SSH_KEY_PATH>

set -e

EC2_IP=${1:-"your-ec2-ip"}
SSH_KEY=${2:-"~/.ssh/your-key.pem"}
REMOTE_DIR="/opt/goff-ui"

echo "=== Deploying to $EC2_IP ==="

# Build images locally
echo "Building Docker images..."
docker build -t goff-ui:latest ./goff-ui
docker build -t flag-manager-api:latest ./flag-manager-api-simple

# Save images
echo "Saving Docker images..."
docker save goff-ui:latest | gzip > /tmp/goff-ui.tar.gz
docker save flag-manager-api:latest | gzip > /tmp/flag-manager-api.tar.gz

# Upload to EC2
echo "Uploading files to EC2..."
scp -i $SSH_KEY docker-compose.yml ec2-user@$EC2_IP:$REMOTE_DIR/
scp -i $SSH_KEY relay-proxy-config.yaml ec2-user@$EC2_IP:$REMOTE_DIR/
scp -i $SSH_KEY /tmp/goff-ui.tar.gz ec2-user@$EC2_IP:$REMOTE_DIR/
scp -i $SSH_KEY /tmp/flag-manager-api.tar.gz ec2-user@$EC2_IP:$REMOTE_DIR/

# Load images and start services
echo "Loading images and starting services..."
ssh -i $SSH_KEY ec2-user@$EC2_IP << 'REMOTE'
cd /opt/goff-ui
gunzip -c goff-ui.tar.gz | docker load
gunzip -c flag-manager-api.tar.gz | docker load
rm -f *.tar.gz
docker-compose up -d
REMOTE

echo "=== Deployment complete! ==="
echo "Frontend: http://$EC2_IP:3000"
echo "Relay Proxy: http://$EC2_IP:1031"
echo "Flag Manager API: http://$EC2_IP:8080"

# Cleanup
rm -f /tmp/goff-ui.tar.gz /tmp/flag-manager-api.tar.gz
