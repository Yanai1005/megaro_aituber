terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "megaro-aituber-tfstate-rg"
    storage_account_name = "megaroaitubertfstate"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

resource "azurerm_resource_group" "main" {
  name     = var.resource_group_name
  location = var.location

  tags = var.tags
}

module "acr" {
  source = "./modules/acr"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  acr_name            = var.acr_name
  tags                = var.tags
}

module "container_app" {
  source = "./modules/container_app"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  app_name            = var.app_name
  acr_login_server    = module.acr.login_server
  acr_admin_username  = module.acr.admin_username
  acr_admin_password  = module.acr.admin_password
  container_image_tag = var.container_image_tag
  cpu                 = var.cpu
  memory              = var.memory
  min_replicas        = var.min_replicas
  max_replicas        = var.max_replicas
  app_env_vars        = var.app_env_vars
  tags                = var.tags
}
