variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "db_username" {
  description = "PostgreSQL database username"
  type        = string
  default     = "postgres"
  sensitive   = true
}

variable "db_password" {
  description = "PostgreSQL database password (at least 8 characters, alphanumeric + special chars)"
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.db_password) >= 8
    error_message = "Database password must be at least 8 characters."
  }
}

variable "repo_url" {
  description = "Git repository, used only when a clone credential is available"
  type        = string
  default     = "https://github.com/ClaxonAI/PitchMyWeb.git"
}

variable "source_s3_url" {
  description = "Source tarball the instance unpacks at first boot"
  type        = string
  default     = "s3://pitchmyweb-prod-recordings-claxonai/deploy/current.tar.gz"
}

variable "ssh_cidr" {
  description = "Optional administrator CIDR allowed to SSH to EC2; leave empty to require SSM Session Manager"
  type        = string
  default     = ""
}

variable "s3_bucket_name" {
  description = "S3 bucket name (must be globally unique)"
  type        = string
  default     = "pitchmyweb-prod-recordings"
}
