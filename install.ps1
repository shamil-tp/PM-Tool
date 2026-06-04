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

$EXISTING_GOOGLE_CLIENT_ID = ""
$EXISTING_GOOGLE_CLIENT_SECRET = ""
$EXISTING_JWT_SECRET = ""
$EXISTING_POSTGRES_PASSWORD = ""
$EXISTING_GEMINI_API_KEY = ""

if (Test-Path ".env") {
    Write-Host "Found existing .env file. Loading existing credentials..." -ForegroundColor Green
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^GOOGLE_CLIENT_ID=(.*)") { $EXISTING_GOOGLE_CLIENT_ID = $matches[1] }
        if ($_ -match "^GOOGLE_CLIENT_SECRET=(.*)") { $EXISTING_GOOGLE_CLIENT_SECRET = $matches[1] }
        if ($_ -match "^JWT_SECRET=(.*)") { $EXISTING_JWT_SECRET = $matches[1] }
        if ($_ -match "^POSTGRES_PASSWORD=(.*)") { $EXISTING_POSTGRES_PASSWORD = $matches[1] }
    }
}

if (Test-Path "frontend\.env") {
    Get-Content "frontend\.env" | ForEach-Object {
        if ($_ -match "^GEMINI_API_KEY=`"?(.*?)`"?$") { $EXISTING_GEMINI_API_KEY = $matches[1] }
    }
}

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
$clientIdPrompt = if ($EXISTING_GOOGLE_CLIENT_ID) { "Enter Google Client ID [leave blank to keep existing]" } else { "Enter Google Client ID" }
$GOOGLE_CLIENT_ID = Read-Host $clientIdPrompt
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_ID) -and $EXISTING_GOOGLE_CLIENT_ID) {
    $GOOGLE_CLIENT_ID = $EXISTING_GOOGLE_CLIENT_ID
}

$clientSecretPrompt = if ($EXISTING_GOOGLE_CLIENT_SECRET) { "Enter Google Client Secret (Input will be hidden) [leave blank to keep existing]" } else { "Enter Google Client Secret (Input will be hidden)" }
$GOOGLE_CLIENT_SECRET = Read-Host $clientSecretPrompt -AsSecureString
$GOOGLE_CLIENT_SECRET_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($GOOGLE_CLIENT_SECRET))
if ([string]::IsNullOrWhiteSpace($GOOGLE_CLIENT_SECRET_PLAIN) -and $EXISTING_GOOGLE_CLIENT_SECRET) {
    $GOOGLE_CLIENT_SECRET_PLAIN = $EXISTING_GOOGLE_CLIENT_SECRET
}

Write-Host "`n--- Gemini API Configuration ---" -ForegroundColor Yellow
$geminiPrompt = if ($EXISTING_GEMINI_API_KEY) { "Enter Gemini API Key (Input will be hidden) [leave blank to keep existing]" } else { "Enter Gemini API Key (Input will be hidden)" }
$GEMINI_API_KEY = Read-Host $geminiPrompt -AsSecureString
$GEMINI_API_KEY_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($GEMINI_API_KEY))
if ([string]::IsNullOrWhiteSpace($GEMINI_API_KEY_PLAIN) -and $EXISTING_GEMINI_API_KEY) {
    $GEMINI_API_KEY_PLAIN = $EXISTING_GEMINI_API_KEY
}

Write-Host "`n--- Database Configuration ---" -ForegroundColor Yellow
$postgresPrompt = if ($EXISTING_POSTGRES_PASSWORD) { "Enter PostgreSQL Password (leave blank to keep existing)" } else { "Enter PostgreSQL Password (leave blank to auto-generate)" }
$POSTGRES_PASSWORD_INPUT = Read-Host $postgresPrompt -AsSecureString
$POSTGRES_PASSWORD_PLAIN = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($POSTGRES_PASSWORD_INPUT))

if ($EXISTING_JWT_SECRET) {
    $JWT_SECRET = $EXISTING_JWT_SECRET
} else {
    Write-Host "`nGenerating secure secrets..." -ForegroundColor Green
    $JWT_SECRET = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | % {[char]$_})
}

if ([string]::IsNullOrWhiteSpace($POSTGRES_PASSWORD_PLAIN)) {
    if ($EXISTING_POSTGRES_PASSWORD) {
        $POSTGRES_PASSWORD = $EXISTING_POSTGRES_PASSWORD
    } else {
        $POSTGRES_PASSWORD = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | % {[char]$_})
    }
} else {
    $POSTGRES_PASSWORD = $POSTGRES_PASSWORD_PLAIN
}

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

Write-Host "Writing backend/core/.env file..." -ForegroundColor Green
if (!(Test-Path -Path "backend\core")) {
    New-Item -ItemType Directory -Path "backend\core" | Out-Null
}
$coreEnvContent = @"
PORT=5003
DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@localhost:5432/pm-tool
JWT_SECRET=${JWT_SECRET}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
"@
Set-Content -Path "backend\core\.env" -Value $coreEnvContent -Encoding UTF8

Write-Host "Writing backend/calender/.env file..." -ForegroundColor Green
if (!(Test-Path -Path "backend\calender")) {
    New-Item -ItemType Directory -Path "backend\calender" | Out-Null
}
$calenderEnvContent = @"
PORT=5000
DB=mongodb://localhost:27017/pm-tool
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET_PLAIN}
REDIRECT_URI=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}/api/calendar/oauth2callback
JWT_SECRET=${JWT_SECRET}
"@
Set-Content -Path "backend\calender\.env" -Value $calenderEnvContent -Encoding UTF8

Write-Host "Writing backend/product-key/.env file..." -ForegroundColor Green
if (!(Test-Path -Path "backend\product-key")) {
    New-Item -ItemType Directory -Path "backend\product-key" | Out-Null
}
$productKeyEnvContent = @"
PORT=5000
DB=mongodb://localhost:27017/pm-tool
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET_PLAIN}
REDIRECT_URI=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}/api/calendar/oauth2callback
JWT_SECRET=${JWT_SECRET}
"@
Set-Content -Path "backend\product-key\.env" -Value $productKeyEnvContent -Encoding UTF8

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

# Open the application in the default browser
$Url = "http://${SERVER_IP}:3077"
Write-Host "Opening $Url in your default browser..." -ForegroundColor Yellow
Start-Process $Url
