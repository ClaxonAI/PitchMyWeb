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

variable "origin_cloudflare_only" {
  description = "Admit web traffic (80/443) only from Cloudflare's edge. Set true once sync-dns.sh has proxied every app hostname, never before."
  type        = bool
  default     = false
}

variable "cloudflare_ipv4_cidrs" {
  description = "Cloudflare's edge ranges (https://www.cloudflare.com/ips-v4). They change rarely; when they do, update this and apply."
  type        = list(string)
  default = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
    "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  ]
}
