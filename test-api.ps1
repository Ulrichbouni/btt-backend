$ErrorActionPreference = 'SilentlyContinue'

function Test-Post($name, $url, $body) {
  try {
    $r = Invoke-WebRequest -Uri $url -Method Post -Body ($body | ConvertTo-Json) -ContentType 'application/json' -UseBasicParsing -TimeoutSec 30
    Write-Output "$name -> HTTP $($r.StatusCode) : $($r.Content)"
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = [int]$resp.StatusCode
      $stream = $resp.GetResponseStream()
      $reader = New-Object System.IO.StreamReader($stream)
      $txt = $reader.ReadToEnd()
      Write-Output "$name -> HTTP $code : $txt"
    } else {
      Write-Output "$name -> ERREUR : $($_.Exception.Message)"
    }
  }
}

$base = 'https://btt-backend-sgas.onrender.com/api'

Test-Post 'health(GET)' "$base/health" $null

Test-Post 'login(invalide, 401 attendu)' "$base/auth/login" @{ email = 'test-inexistant@example.com'; mot_de_passe = 'wrongpass123' }

Test-Post 'register(champ manquant, 400 attendu)' "$base/auth/register" @{ nom = 'T' }

Test-Post 'request-otp(502+details ou success attendu)' "$base/auth/request-otp" @{ telephone = '+237600000000'; channel = 'sms' }
