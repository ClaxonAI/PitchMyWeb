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

variable "recording_retention_days" {
  description = "Days a demo video stays downloadable; keep equal to the app's VIDEO_RETENTION_DAYS. The bucket expires recordings 2 days after this as a backstop."
  type        = number
  default     = 7
  validation {
    condition     = var.recording_retention_days >= 1 && var.recording_retention_days <= 90
    error_message = "recording_retention_days must be between 1 and 90 (the app accepts the same range)."
  }
}

variable "instance_type" {
  description = "EC2 instance type for the app box (see the comment on aws_instance.app)"
  type        = string
  default     = "t3.medium"
}
