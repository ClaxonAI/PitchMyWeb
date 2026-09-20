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

# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "pitchmyweb-vpc"
  }
}

# Public Subnet (for EC2)
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "pitchmyweb-public"
  }
}

# Private Subnets (for RDS, ElastiCache)
resource "aws_subnet" "private_1" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "${var.aws_region}b"

  tags = {
    Name = "pitchmyweb-private-1"
  }
}

resource "aws_subnet" "private_2" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.3.0/24"
  availability_zone = "${var.aws_region}c"

  tags = {
    Name = "pitchmyweb-private-2"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "pitchmyweb-igw"
  }
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block      = "0.0.0.0/0"
    gateway_id      = aws_internet_gateway.main.id
  }

  tags = {
    Name = "pitchmyweb-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# Security Group for EC2
resource "aws_security_group" "ec2" {
  name        = "pitchmyweb-ec2"
  description = "Security group for PitchMyWeb EC2 instance"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
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
    Name = "pitchmyweb-ec2-sg"
  }
}

# Security Group for RDS
resource "aws_security_group" "rds" {
  name        = "pitchmyweb-rds"
  description = "Security group for PitchMyWeb RDS"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "pitchmyweb-rds-sg"
  }
}

# Security Group for ElastiCache
resource "aws_security_group" "redis" {
  name        = "pitchmyweb-redis"
  description = "Security group for PitchMyWeb Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "pitchmyweb-redis-sg"
  }
}

# DB Subnet Group
resource "aws_db_subnet_group" "main" {
  name       = "pitchmyweb-db-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]

  tags = {
    Name = "pitchmyweb-db-subnet-group"
  }
}

# RDS PostgreSQL
resource "aws_db_instance" "postgres" {
  identifier            = "pitchmyweb-db"
  engine                = "postgres"
  engine_version        = "15"
  instance_class        = "db.t3.micro"
  allocated_storage     = 20
  storage_type          = "gp3"
  db_name               = "pitchmyweb"
  username              = var.db_username
  password              = var.db_password
  db_subnet_group_name  = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  skip_final_snapshot   = true
  backup_retention_period = 7

  tags = {
    Name = "pitchmyweb-db"
  }
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "main" {
  name       = "pitchmyweb-redis-subnet-group"
  subnet_ids = [aws_subnet.private_1.id, aws_subnet.private_2.id]

  tags = {
    Name = "pitchmyweb-redis-subnet-group"
  }
}

# ElastiCache Redis
resource "aws_elasticache_cluster" "redis" {
  cluster_id           = "pitchmyweb-redis"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t3.micro"
  num_cache_nodes      = 1
  parameter_group_name = "default.redis7"
  port                 = 6379
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]

  tags = {
    Name = "pitchmyweb-redis"
  }
}

# S3 Bucket for recordings and images
resource "aws_s3_bucket" "storage" {
  bucket = var.s3_bucket_name

  tags = {
    Name = "pitchmyweb-storage"
  }
}

resource "aws_s3_bucket_versioning" "storage" {
  bucket = aws_s3_bucket.storage.id
  versioning_configuration {
    status = "Enabled"
  }
}

# IAM Role for EC2
resource "aws_iam_role" "ec2_role" {
  name = "pitchmyweb-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# Lets the SSM *agent* register with Systems Manager so Session Manager and
# send-command work. This is separate from the Parameter Store read below:
# that grants ssm:GetParameter, while the agent needs the ssmmessages/
# ec2messages channel actions. Without this the instance never appears in
# describe-instance-information, however long you wait.
resource "aws_iam_role_policy_attachment" "ssm_managed_core" {
  role       = aws_iam_role.ec2_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# IAM Policy for SSM and KMS
resource "aws_iam_role_policy" "ssm_policy" {
  name = "pitchmyweb-ssm-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParametersByPath",
          "ssm:GetParameter"
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/pitchmyweb/prod/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:ViaService" = "ssm.${var.aws_region}.amazonaws.com"
          }
        }
      }
    ]
  })
}

# IAM Policy for S3
resource "aws_iam_role_policy" "s3_policy" {
  name = "pitchmyweb-s3-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.storage.arn,
          "${aws_s3_bucket.storage.arn}/*"
        ]
      }
    ]
  })
}

# IAM Instance Profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "pitchmyweb-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# EC2 Instance
resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = "t3.large"
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.ec2.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  key_name               = "pitchmyweb-prod"

  # Bootstraps the box at first boot so a replacement comes back on its own
  # rather than needing a shell. Output lands in /var/log/cloud-init-output.log
  # and /var/log/pitchmyweb-bootstrap.log.
  #
  # Replace on change, because user_data runs only at first boot: edited in
  # place it would sit on the disk having never executed, and the box would
  # silently not match the config.
  user_data_replace_on_change = true

  user_data = <<-EOF
    #!/usr/bin/env bash
    set -euxo pipefail
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq git curl unzip

    # The aws CLI has to exist before the clone, because the credential for it
    # lives in Parameter Store. bootstrap.sh installs it too; both check first.
    if ! command -v aws >/dev/null; then
      curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
      unzip -q -o /tmp/awscliv2.zip -d /tmp
      /tmp/aws/install --update
    fi

    # The repository is private. A credential helper is used rather than a
    # token in the clone URL: the URL form leaves the token in .git/config and
    # in this script's output under /var/log, and it would not survive the
    # fetch bootstrap.sh runs on redeploy. This asks SSM each time instead, so
    # the token is never written to disk and rotating it needs no change here.
    sudo -u ubuntu git config --global credential.helper \
      '!f() { echo username=x-access-token; echo "password=$(aws ssm get-parameter --name /pitchmyweb/prod/GITHUB_TOKEN --with-decryption --region ${var.aws_region} --query Parameter.Value --output text)"; }; f'
    sudo -u ubuntu git config --global credential.'https://github.com'.useHttpPath false

    sudo -u ubuntu git clone ${var.repo_url} /home/ubuntu/PitchMyWeb
    bash /home/ubuntu/PitchMyWeb/infrastructure/aws/bootstrap.sh
  EOF

  tags = {
    Name = "pitchmyweb-app"
  }
}

# Elastic IP
resource "aws_eip" "app" {
  instance = aws_instance.app.id
  domain   = "vpc"

  tags = {
    Name = "pitchmyweb-eip"
  }

  depends_on = [aws_internet_gateway.main]
}

# Data sources
data "aws_caller_identity" "current" {}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}
