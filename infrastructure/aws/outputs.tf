output "ec2_public_ip" {
  description = "Public IP of the EC2 instance (Elastic IP)"
  value       = aws_eip.app.public_ip
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app.id
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgres.endpoint
}

output "rds_address" {
  description = "RDS PostgreSQL hostname (use for DATABASE_URL)"
  value       = aws_db_instance.postgres.address
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.postgres.port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = aws_db_instance.postgres.db_name
}

output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_cluster.redis.port
}

output "s3_bucket_name" {
  description = "S3 bucket name for storage"
  value       = aws_s3_bucket.storage.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.storage.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "next_steps" {
  description = "Next steps after infrastructure is created"
  value = <<-EOT
    1. Create a terraform.tfvars file with:
       db_password = "your-strong-password"
       s3_bucket_name = "your-unique-bucket-name"

    2. Run: terraform init && terraform plan
    3. Run: terraform apply
    4. Put every variable in docs/production-setup.md into SSM Parameter
       Store under /pitchmyweb/prod/<NAME>, including:
       - DATABASE_URL=postgresql://postgres:PASSWORD@HOST:5432/pitchmyweb?sslmode=require
       - NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-ca.pem
       - REDIS_URL=redis://HOST:6379
       - RATE_LIMIT_STORE=redis
       - STORAGE_ENDPOINT=https://s3.ap-south-1.amazonaws.com   (scheme required)
       - STORAGE_BUCKET=your-bucket-name
       - STORAGE_REGION=ap-south-1
       No STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY: the instance role grants S3.

    5. Ship the source and deploy (see "Deploying" in docs/production-setup.md):
       git archive --format=tar.gz -o /tmp/pmw.tar.gz HEAD
       aws s3 cp /tmp/pmw.tar.gz s3://BUCKET/deploy/current.tar.gz
       then on the box: sudo SOURCE_S3=s3://BUCKET/deploy/current.tar.gz bash infrastructure/aws/bootstrap.sh
  EOT
}
