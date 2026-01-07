# AWS Deployment Options

## Cost Comparison

| Option | Monthly Cost | Pros | Cons |
|--------|-------------|------|------|
| **EC2 t3.micro** | ~$8-12 | Cheapest, simple | Single point of failure |
| **EC2 t3.small** | ~$15-20 | More headroom | Still single instance |
| **ECS Fargate** | ~$25-40 | Serverless, scales | More complex |
| **ECS Fargate Spot** | ~$10-15 | 70% cheaper Fargate | Can be interrupted |
| **EKS** | ~$75+ | Full K8s | Control plane costs $73/mo |
| **Lightsail** | ~$10-20 | Simple, predictable | Limited scaling |

## Recommended: EC2 t3.micro (~$8-12/month)

Best for small teams, development, or low-traffic production.

### Cost Breakdown
- t3.micro: ~$7.60/month (us-east-1)
- 20GB gp3 EBS: ~$1.60/month
- Elastic IP: Free while attached
- Data transfer: ~$0-2/month (first 100GB free)
- **Total: ~$9-12/month**

### Quick Deploy

1. **Create EC2 instance:**
   ```bash
   cd terraform
   terraform init
   terraform apply -var="key_name=your-key-name"
   ```

2. **Deploy application:**
   ```bash
   ./deploy-aws.sh <EC2_IP> ~/.ssh/your-key.pem
   ```

3. **Access:**
   - Frontend: `http://<EC2_IP>:3000`
   - Relay Proxy: `http://<EC2_IP>:1031`

### Adding SSL (Free with Let's Encrypt)

1. Point your domain to the EC2 IP
2. SSH into the instance
3. Install Certbot:
   ```bash
   sudo dnf install -y certbot
   sudo certbot certonly --standalone -d your-domain.com
   ```
4. Update nginx.conf to use the certificates

---

## Option 2: ECS Fargate Spot (~$10-15/month)

Better for production with availability requirements.

### Cost Breakdown
- Fargate Spot: ~70% cheaper than on-demand
- ~0.25 vCPU, 0.5GB per container × 3 containers
- ~$8-12/month for compute
- Data transfer: ~$0-2/month
- **Total: ~$10-15/month**

### Setup

```bash
cd terraform-ecs
terraform init
terraform apply
```

---

## Option 3: Single Container on App Runner (~$15-25/month)

Simplest deployment, but more expensive.

```bash
aws apprunner create-service \
  --service-name goff-ui \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "your-ecr-repo/goff-ui:latest",
      "ImageRepositoryType": "ECR"
    }
  }'
```

---

## Architecture Comparison

### EC2 Single Instance
```
┌─────────────────────────────────────┐
│           EC2 t3.micro              │
│  ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │Frontend │ │Flag API │ │Relay  │ │
│  │ :3000   │ │ :8080   │ │:1031  │ │
│  └─────────┘ └─────────┘ └───────┘ │
│       Docker Compose                │
└─────────────────────────────────────┘
```

### ECS Fargate
```
┌─────────────────────────────────────────────┐
│              ECS Cluster                     │
│  ┌─────────┐  ┌─────────┐  ┌─────────────┐ │
│  │Frontend │  │Flag API │  │Relay Proxy  │ │
│  │ Task    │  │ Task    │  │   Task      │ │
│  └────┬────┘  └────┬────┘  └──────┬──────┘ │
│       └────────────┼───────────────┘        │
│                    ▼                         │
│              ALB / API Gateway               │
└─────────────────────────────────────────────┘
```

---

## Production Recommendations

### Minimum (Small Team)
- EC2 t3.small ($15/mo)
- Daily EBS snapshots
- CloudWatch basic monitoring

### Standard (Production)
- ECS Fargate with 2 tasks per service
- Application Load Balancer
- RDS for persistent storage (optional)
- CloudWatch alarms

### High Availability
- Multi-AZ ECS deployment
- Aurora Serverless for storage
- CloudFront for caching
- WAF for security

---

## Environment Variables for AWS

```bash
# EC2 deployment
FLAG_MANAGER_API_URL=http://localhost:8080
RELAY_PROXY_URL=http://localhost:1031

# ECS deployment (use service discovery)
FLAG_MANAGER_API_URL=http://flag-manager-api.goff.local:8080
RELAY_PROXY_URL=http://relay-proxy.goff.local:1031
```

---

## Backup & Recovery

### Flag Data Backup
```bash
# On EC2, backup the flags volume
docker run --rm -v goff-ui_flags-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/flags-backup-$(date +%Y%m%d).tar.gz /data

# Upload to S3
aws s3 cp flags-backup-*.tar.gz s3://your-backup-bucket/
```

### Restore
```bash
# Download from S3
aws s3 cp s3://your-backup-bucket/flags-backup-20240101.tar.gz .

# Restore to volume
docker run --rm -v goff-ui_flags-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/flags-backup-20240101.tar.gz -C /
```

---

## Monitoring

### Basic (Free)
- CloudWatch default metrics
- Docker logs

### Enhanced ($3-5/month)
- CloudWatch detailed monitoring
- Log Insights queries
- Basic alarms

```bash
# Create alarm for high CPU
aws cloudwatch put-metric-alarm \
  --alarm-name goff-ui-cpu-high \
  --metric-name CPUUtilization \
  --namespace AWS/EC2 \
  --statistic Average \
  --period 300 \
  --threshold 80 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --instance-id i-xxxxx
```
