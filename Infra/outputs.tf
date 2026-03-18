output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "acr_login_server" {
  description = "ACR login server URL"
  value       = module.acr.login_server
}

output "acr_name" {
  description = "ACR name"
  value       = module.acr.name
}

output "container_app_url" {
  description = "Container App public URL"
  value       = module.container_app.app_url
}

output "container_app_name" {
  description = "Container App name"
  value       = module.container_app.app_name
}
