# install.ps1 - Installer for Windows

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "    PM-Tool Automated Installer           " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Ensure the script is running with administrative privileges
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (!$isAdmin) {
    Write-Host "Error: This script must be run as an Administrator to install software via winget." -ForegroundColor Red
    Write-Host "Please restart PowerShell as Administrator and try again." -ForegroundColor Yellow
    Exit
}

# 1. Check and Install Docker Desktop
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found. Attempting to install via winget..." -ForegroundColor Yellow
    
    # Installing Docker Desktop (Standard winget ID)
    winget install --id Docker.DockerDesktop --silent --accept-source-agreements --accept-package-agreements
    
    # Verify installation success
    if (Get-Command docker -ErrorAction SilentlyContinue) {
        Write-Host "Docker installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Warning: Winget finished, but 'docker' command is still not in PATH. You may need to restart your terminal or computer." -ForegroundColor Yellow
    }
} else {
    Write-Host "Docker is already installed." -ForegroundColor Green
}

# 2. Check and Install Docker Compose
# Note: Modern Docker Desktop includes docker-compose natively as 'docker compose' (without the hyphen).
# This checks for both the legacy standalone executable and the plugin syntax.
if (!(Get-Command docker-compose -ErrorAction SilentlyContinue) -and !(docker compose version -ErrorAction SilentlyContinue)) {
    Write-Host "Docker Compose not found. Attempting to install via winget..." -ForegroundColor Yellow
    
    # Installing Docker Compose standalone CLI
    winget install --id Docker.DockerCompose --silent --accept-source-agreements --accept-package-agreements
    
    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        Write-Host "Docker Compose installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Warning: Winget finished, but 'docker-compose' command is still not recognized." -ForegroundColor Yellow
    }
} else {
    Write-Host "Docker Compose is already available." -ForegroundColor Green
}

# Default values
$DEFAULT_SERVER_IP = "localhost"
$DEFAULT_CALENDAR_PORT = "5001"
$DEFAULT_PRODUCT_KEY_PORT = "5002"

#Listing Out All Present IP's
Write-Host "================== Present IP's ==================" -ForegroundColor Cyan
gip | Where-Object Status -ne "Disconnected" | Select-Object @{N="Interface Alias";E={$_.InterfaceAlias}}, @{N="IP";E={$_.IPv4Address.IPAddress}} | Format-Table -AutoSize
Write-Host "==================================================" -ForegroundColor Cyan

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
