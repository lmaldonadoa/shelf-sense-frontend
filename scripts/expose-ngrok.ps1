param(
  [ValidateSet("frontend", "backend")]
  [string]$Target = "frontend",

  [switch]$RestartExisting
)

$ErrorActionPreference = "Stop"

function Test-LocalHttp {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port,

    [string]$Path = "/"
  )

  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -UseBasicParsing -TimeoutSec 4
    return $response.StatusCode -ge 200
  } catch {
    return $false
  }
}

function Invoke-NgrokApi {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$Path,

    [object]$Body
  )

  $params = @{
    Uri = "http://127.0.0.1:4040$Path"
    Method = $Method
    UseBasicParsing = $true
    TimeoutSec = 8
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = ($Body | ConvertTo-Json -Depth 5)
  }

  return Invoke-WebRequest @params
}

$config = if ($Target -eq "backend") {
  @{
    Name = "supermarket-backend-8080"
    Port = 8080
    HealthPath = "/health"
  }
} else {
  @{
    Name = "supermarket-web-3000"
    Port = 3000
    HealthPath = "/"
  }
}

if (-not (Test-LocalHttp -Port $config.Port -Path $config.HealthPath)) {
  throw "No hay respuesta HTTP en localhost:$($config.Port). Levanta primero el servicio '$Target'."
}

try {
  $tunnelsResponse = Invoke-NgrokApi -Method "GET" -Path "/api/tunnels"
  $tunnels = ($tunnelsResponse.Content | ConvertFrom-Json).tunnels
} catch {
  throw "No hay una sesion local de ngrok escuchando en http://127.0.0.1:4040. Inicia ngrok primero o ejecuta 'ngrok http $($config.Port)'."
}

$otherTunnels = @($tunnels | Where-Object { $_.config.addr -ne "http://localhost:$($config.Port)" })
if ($RestartExisting -and $otherTunnels.Count -gt 0) {
  foreach ($tunnel in $otherTunnels) {
    Invoke-NgrokApi -Method "DELETE" -Path $tunnel.uri | Out-Null
  }

  $tunnelsResponse = Invoke-NgrokApi -Method "GET" -Path "/api/tunnels"
  $tunnels = ($tunnelsResponse.Content | ConvertFrom-Json).tunnels
}

$existingTargetTunnel = $tunnels | Where-Object { $_.config.addr -eq "http://localhost:$($config.Port)" } | Select-Object -First 1
if ($existingTargetTunnel) {
  Write-Output "TunnelName=$($existingTargetTunnel.name)"
  Write-Output "PublicUrl=$($existingTargetTunnel.public_url)"
  Write-Output "LocalAddr=$($existingTargetTunnel.config.addr)"
  exit 0
}

$conflictingTunnel = $tunnels | Where-Object { $_.public_url } | Select-Object -First 1
if ($conflictingTunnel -and -not $RestartExisting) {
  throw ("Ya existe un ngrok publicado hacia {0}. " +
    "Para reutilizar esta sesion con el nuevo target, vuelve a ejecutar con -RestartExisting o cierra ese tunnel manualmente.") -f $conflictingTunnel.config.addr
}

if ($conflictingTunnel -and $RestartExisting) {
  Invoke-NgrokApi -Method "DELETE" -Path $conflictingTunnel.uri | Out-Null
}

$newTunnelResponse = Invoke-NgrokApi -Method "POST" -Path "/api/tunnels" -Body @{
  name = $config.Name
  proto = "http"
  addr = "$($config.Port)"
}

$newTunnel = $newTunnelResponse.Content | ConvertFrom-Json
Write-Output "TunnelName=$($newTunnel.name)"
Write-Output "PublicUrl=$($newTunnel.public_url)"
Write-Output "LocalAddr=http://localhost:$($config.Port)"
