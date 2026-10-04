param([string]$Url, [string]$PublicKey)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$result = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers @{apikey=$PublicKey} -TimeoutSec 30
[Console]::Write($result.Content)
