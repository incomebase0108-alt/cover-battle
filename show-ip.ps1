# Print usable private LAN IPv4 URLs (skip 192.0.0.x, APIPA 169.254.x, virtual, etc.)
$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.IPAddress -ne '127.0.0.1' }
if (-not $ips) { Write-Output "    (LAN IP not found - check Wi-Fi/Ethernet)"; return }
foreach ($ip in $ips) { Write-Output ("    http://{0}:8080/netclient.html" -f $ip.IPAddress) }
