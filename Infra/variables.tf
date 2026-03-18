variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "megaro-aituber-prod-rg"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "japaneast"
}

variable "acr_name" {
  description = "Azure Container Registry name (globally unique, lowercase alphanumeric only)"
  type        = string
  default     = "megaroacr"
}

variable "app_name" {
  description = "Container App name"
  type        = string
  default     = "megaro-aituber"
}

variable "container_image_tag" {
  description = "Docker image tag to deploy"
  type        = string
  default     = "latest"
}

variable "cpu" {
  description = "CPU cores for the container (e.g. 0.5, 1.0)"
  type        = number
  default     = 1.0
}

variable "memory" {
  description = "Memory for the container (e.g. '2Gi')"
  type        = string
  default     = "2Gi"
}

variable "min_replicas" {
  description = "Minimum number of replicas"
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of replicas"
  type        = number
  default     = 3
}

variable "app_env_vars" {
  description = "Environment variables for the Container App (non-secret)"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    project     = "megaro-aituber"
    environment = "prod"
    managed_by  = "terraform"
  }
}
