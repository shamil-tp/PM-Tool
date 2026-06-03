#!/bin/bash
# install.sh - Installer for macOS and Linux

echo "=========================================="
echo "    PM-Tool Automated Installer           "
echo "=========================================="
echo ""

# Default values
DEFAULT_SERVER_IP="localhost"
DEFAULT_CALENDAR_PORT="5001"
DEFAULT_PRODUCT_KEY_PORT="5002"

# Prompt for inputs
read -p "Enter Server IP or Domain [default: $DEFAULT_SERVER_IP]: " SERVER_IP
SERVER_IP=${SERVER_IP:-$DEFAULT_SERVER_IP}

echo ""
echo "--- Google OAuth Credentials ---"
read -p "Enter Google Client ID: " GOOGLE_CLIENT_ID
read -s -p "Enter Google Client Secret: " GOOGLE_CLIENT_SECRET
echo ""

echo ""
echo "--- Gemini API Configuration ---"
read -s -p "Enter Gemini API Key: " GEMINI_API_KEY
echo ""

echo ""
echo "Generating secure secrets..."
# Generate random strings
if command -v openssl >/dev/null 2>&1; then
    JWT_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
else
    # Fallback if openssl is not available
    JWT_SECRET=$(LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 64)
    POSTGRES_PASSWORD=$(LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 32)
fi

echo "Writing root .env file..."
cat <<EOF > .env
VITE_CALENDAR_API_URL=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
REDIRECT_URI=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}/api/calendar/oauth2callback
JWT_SECRET=${JWT_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DB=mongodb://mongodb:27017/pm-tool
EOF

echo "Writing frontend/.env file..."
mkdir -p frontend
cat <<EOF > frontend/.env
GEMINI_API_KEY="${GEMINI_API_KEY}"
VITE_PRODUCT_KEY_API_URL="http://${SERVER_IP}:${DEFAULT_PRODUCT_KEY_PORT}"
VITE_CALENDAR_API_URL="http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}"
EOF

echo ""
echo "Environment files created successfully."
echo "Starting Docker containers..."

if command -v docker-compose >/dev/null 2>&1; then
    docker-compose up -d --build
else
    docker compose up -d --build
fi

echo ""
echo "=========================================="
echo "Installation complete!"
echo "Frontend is accessible at: http://${SERVER_IP}:3077"
echo "=========================================="
