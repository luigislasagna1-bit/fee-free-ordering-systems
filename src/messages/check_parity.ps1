$en = Get-Content en.json -Raw | ConvertFrom-Json

function ExtractKeys($obj, $prefix = "") {
    $keys = @{}
    foreach ($key in $obj.PSObject.Properties.Name) {
        $fullKey = if ($prefix) { "$prefix.$key" } else { $key }
        $keys[$fullKey] = $true
        $val = $obj.$key
        if ($val -is [System.Management.Automation.PSCustomObject]) {
            $nested = ExtractKeys $val $fullKey
            foreach ($nk in $nested.Keys) { $keys[$nk] = $true }
        }
    }
    return $keys
}

$enKeys = ExtractKeys $en
$locales = @("fr", "es", "it", "pt")

foreach ($locale in $locales) {
    Write-Host "=== $locale.json ===" -ForegroundColor Cyan
    $loc = Get-Content "$locale.json" -Raw | ConvertFrom-Json
    $locKeys = ExtractKeys $loc
    
    $missing = @()
    $extra = @()
    
    foreach ($k in $enKeys.Keys) {
        if (-not $locKeys.ContainsKey($k)) {
            $missing += $k
        }
    }
    
    foreach ($k in $locKeys.Keys) {
        if (-not $enKeys.ContainsKey($k)) {
            $extra += $k
        }
    }
    
    if ($missing) { Write-Host "MISSING KEYS ($($missing.Count)):" -ForegroundColor Red; $missing | Select-Object -First 10 }
    if ($extra) { Write-Host "EXTRA KEYS ($($extra.Count)):" -ForegroundColor Yellow; $extra | Select-Object -First 10 }
    if (-not $missing -and -not $extra) { Write-Host "PERFECT PARITY" -ForegroundColor Green }
    Write-Host ""
}
