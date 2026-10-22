# Adds the read-only Aspire MCP token to the aspire-ops vault in the Claude Console.
# The token is typed at a hidden prompt, sent straight to Anthropic, and never saved or shown.
# Run: powershell -ExecutionPolicy Bypass -File agents\aspire-ops\add-token.ps1
$ErrorActionPreference = 'Stop'
$vault = 'vlt_011CgG9eWeaQbgQdU8JvYY28'
$ant = Join-Path $env:USERPROFILE '.local\bin\ant.exe'

$secure = Read-Host 'Paste the Aspire MCP token and press Enter (it will not be shown)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim()
  if (-not $token.StartsWith('asp_mcp_')) { throw 'That does not look like an Aspire MCP token (it starts with asp_mcp_). Nothing was sent.' }
  $body = @{
    display_name = 'Aspire MCP (read-only)'
    auth = @{ type = 'static_bearer'; mcp_server_url = 'https://aspire.thechunkmedia.com/api/mcp'; token = $token }
  } | ConvertTo-Json -Compress
  $body | & $ant beta:vaults:credentials create --vault-id $vault
  if ($LASTEXITCODE -eq 0) { Write-Host "`nSaved. Tell Claude 'done'." -ForegroundColor Green }
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  Remove-Variable token, body -ErrorAction SilentlyContinue
}
