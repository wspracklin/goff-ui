# Cheap AWS Deployment for GO Feature Flag UI
# Estimated cost: ~$8-15/month (t3.micro with minimal storage)

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region"
  default     = "us-east-1" # Cheapest region
}

variable "instance_type" {
  description = "EC2 instance type"
  default     = "t3.micro" # Free tier eligible, ~$8/month after
}

variable "key_name" {
  description = "SSH key pair name"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the application (optional)"
  default     = ""
}

# VPC - Use default VPC to save costs
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group
resource "aws_security_group" "goff_ui" {
  name        = "goff-ui-sg"
  description = "Security group for GO Feature Flag UI"
  vpc_id      = data.aws_vpc.default.id

  # SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # Restrict this in production!
  }

  # HTTP
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # HTTPS
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Frontend (for direct access during development)
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Flag Manager API
  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Relay Proxy
  ingress {
    from_port   = 1031
    to_port     = 1031
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "goff-ui-sg"
  }
}

# Latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# User data script to set up Docker
locals {
  user_data = <<-EOF
    #!/bin/bash
    set -e

    # Update system
    dnf update -y

    # Install Docker
    dnf install -y docker git
    systemctl enable docker
    systemctl start docker

    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Add ec2-user to docker group
    usermod -aG docker ec2-user

    # Create app directory
    mkdir -p /opt/goff-ui
    chown ec2-user:ec2-user /opt/goff-ui

    # Create a simple startup script
    cat > /opt/goff-ui/start.sh << 'SCRIPT'
    #!/bin/bash
    cd /opt/goff-ui
    docker-compose up -d
    SCRIPT
    chmod +x /opt/goff-ui/start.sh

    # Create systemd service for auto-start
    cat > /etc/systemd/system/goff-ui.service << 'SERVICE'
    [Unit]
    Description=GO Feature Flag UI
    After=docker.service
    Requires=docker.service

    [Service]
    Type=oneshot
    RemainAfterExit=yes
    WorkingDirectory=/opt/goff-ui
    ExecStart=/usr/local/bin/docker-compose up -d
    ExecStop=/usr/local/bin/docker-compose down
    User=ec2-user

    [Install]
    WantedBy=multi-user.target
    SERVICE

    systemctl daemon-reload
    systemctl enable goff-ui

    echo "Setup complete! Upload your docker-compose.yml to /opt/goff-ui/"
  EOF
}

# EC2 Instance
resource "aws_instance" "goff_ui" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.goff_ui.id]
  subnet_id              = data.aws_subnets.default.ids[0]

  user_data = local.user_data

  root_block_device {
    volume_size = 20 # GB - enough for Docker images
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name = "goff-ui"
  }

  # Enable detailed monitoring (adds ~$3/month, optional)
  monitoring = false
}

# Elastic IP (optional, adds ~$3.65/month if instance is stopped)
resource "aws_eip" "goff_ui" {
  instance = aws_instance.goff_ui.id
  domain   = "vpc"

  tags = {
    Name = "goff-ui-eip"
  }
}

# Outputs
output "instance_public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_eip.goff_ui.public_ip
}

output "instance_public_dns" {
  description = "Public DNS of the EC2 instance"
  value       = aws_instance.goff_ui.public_dns
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i ~/.ssh/${var.key_name}.pem ec2-user@${aws_eip.goff_ui.public_ip}"
}

output "frontend_url" {
  description = "Frontend URL"
  value       = "http://${aws_eip.goff_ui.public_ip}:3000"
}

output "relay_proxy_url" {
  description = "Relay Proxy URL"
  value       = "http://${aws_eip.goff_ui.public_ip}:1031"
}

output "deployment_instructions" {
  description = "Next steps"
  value       = <<-EOT

    Deployment Instructions:
    1. SSH into the instance:
       ssh -i ~/.ssh/${var.key_name}.pem ec2-user@${aws_eip.goff_ui.public_ip}

    2. Clone your repo or upload files:
       scp -i ~/.ssh/${var.key_name}.pem -r ./docker-compose.yml ec2-user@${aws_eip.goff_ui.public_ip}:/opt/goff-ui/

    3. Start the services:
       cd /opt/goff-ui && docker-compose up -d

    4. Access the UI:
       http://${aws_eip.goff_ui.public_ip}:3000

  EOT
}
