# install.ps1 - Installer for Windows

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "    PM-Tool Automated Installer           " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Default values
$DEFAULT_SERVER_IP = "localhost"
$DEFAULT_CALENDAR_PORT = "5001"
$DEFAULT_PRODUCT_KEY_PORT = "5002"

# Prompt for inputs
$SERVER_IP = Read-Host "Enter Server IP or Domain [default: $DEFAULT_SERVER_IP]"
if ([string]::IsNullOrWhiteSpace($SERVER_IP)) {
    $SERVER_IP = $DEFAULT_SERVER_IP
}

Write-Host "`n--- Google OAuth Credentials ---" -ForegroundColor Yellow
$GOOGLE_CLIENT_ID = Read-Host "Enter Google Client ID"
$GOOGLE_CLIENT_SECRET = Read-Host "Enter Google Client Secret (Input will be hidden)" -AsSecureString
$GOOGLE_CLIENT_SECRET_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($GOOGLE_CLIENT_SECRET))

Write-Host "`n--- Gemini API Configuration ---" -ForegroundColor Yellow
$GEMINI_API_KEY = Read-Host "Enter Gemini API Key (Input will be hidden)" -AsSecureString
$GEMINI_API_KEY_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($GEMINI_API_KEY))

Write-Host "`nGenerating secure secrets..." -ForegroundColor Green
# Generate random strings
$JWT_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})
$POSTGRES_PASSWORD = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})

Write-Host "Writing root .env file..." -ForegroundColor Green

$envContent = @"
VITE_CALENDAR_API_URL=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET_PLAIN}
REDIRECT_URI=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}/api/calendar/oauth2callback
JWT_SECRET=${JWT_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DB=mongodb://mongodb:27017/pm-tool
"@

Set-Content -Path .env -Value $envContent -Encoding UTF8

Write-Host "Writing frontend/.env file..." -ForegroundColor Green

if (!(Test-Path -Path "frontend")) {
    New-Item -ItemType Directory -Path "frontend" | Out-Null
}

$frontendEnvContent = @"
GEMINI_API_KEY="${GEMINI_API_KEY_PLAIN}"
VITE_PRODUCT_KEY_API_URL="http://${SERVER_IP}:${DEFAULT_PRODUCT_KEY_PORT}"
VITE_CALENDAR_API_URL="http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}"
"@

Set-Content -Path "frontend\.env" -Value $frontendEnvContent -Encoding UTF8

Write-Host "`nEnvironment files created successfully." -ForegroundColor Green
Write-Host "Starting Docker containers..." -ForegroundColor Green

if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    docker-compose up -d --build
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
    docker compose up -d --build
} else {
    Write-Host "Error: Docker or docker-compose not found in PATH." -ForegroundColor Red
    Exit
}

Write-Host "`n==========================================" -ForegroundColor Cyan
Write-Host "Installation complete!" -ForegroundColor Green
Write-Host "Frontend is accessible at: http://${SERVER_IP}:3077" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
