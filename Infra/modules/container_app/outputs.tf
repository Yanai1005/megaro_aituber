output "app_url" {
  description = "Container App public URL"
  value       = "https://${azurerm_container_app.main.ingress[0].fqdn}"
}

output "app_name" {
  description = "Container App name"
  value       = azurerm_container_app.main.name
}
