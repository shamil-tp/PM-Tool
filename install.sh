#!/bin/bash
# install.sh - Installer for macOS and Linux

# Colors
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}==========================================${NC}"
echo -e "${CYAN}    PM-Tool Automated Installer           ${NC}"
echo -e "${CYAN}==========================================${NC}"
echo ""

OS="$(uname -s)"

# 1. Check and Install Docker
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Docker not found. Attempting to install...${NC}"
    if [ "$OS" = "Darwin" ]; then
        if command -v brew &> /dev/null; then
            brew install --cask docker
            echo -e "${GREEN}Docker installed successfully! Please open Docker Desktop to start the daemon.${NC}"
        else
            echo -e "${RED}Homebrew not found. Please install Docker Desktop manually: https://docs.docker.com/desktop/install/mac-install/${NC}"
            exit 1
        fi
    elif [ "$OS" = "Linux" ]; then
        echo -e "${YELLOW}Downloading and running official Docker install script...${NC}"
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
        echo -e "${GREEN}Docker installed successfully!${NC}"
    else
        echo -e "${RED}Unsupported OS for automatic Docker installation. Please install manually.${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}Docker is already installed.${NC}"
fi

# 2. Check and Install Docker Compose
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${YELLOW}Docker Compose not found. Attempting to install...${NC}"
    if [ "$OS" = "Darwin" ]; then
        echo -e "${GREEN}Docker Desktop for Mac includes Docker Compose. Make sure Docker is running.${NC}"
    elif [ "$OS" = "Linux" ]; then
        sudo apt-get update && sudo apt-get install docker-compose-plugin -y
        if docker compose version &> /dev/null; then
            echo -e "${GREEN}Docker Compose installed successfully!${NC}"
        else
            echo -e "${RED}Failed to install Docker Compose. You might need to install it manually.${NC}"
        fi
    fi
else
    echo -e "${GREEN}Docker Compose is already available.${NC}"
fi
echo ""

# Default values
DEFAULT_SERVER_IP="localhost"
DEFAULT_CALENDAR_PORT="5001"
DEFAULT_PRODUCT_KEY_PORT="5002"

# Listing Out All Present IP's
echo -e "${CYAN}================== Present IP's ==================${NC}"
if [ "$OS" = "Darwin" ]; then
    ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}'
else
    if command -v hostname &> /dev/null && hostname -I &> /dev/null; then
        hostname -I | tr ' ' '\n' | grep -v '^$'
    elif command -v ip &> /dev/null; then
        ip -4 addr show | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | grep -v 127.0.0.1
    else
        echo "Unable to automatically detect IPs. Use 'ifconfig' or 'ip a'."
    fi
fi
echo -e "${CYAN}==================================================${NC}"
echo ""

# Prompt for inputs
read -p "Enter Server IP or Domain [default: $DEFAULT_SERVER_IP]: " SERVER_IP
SERVER_IP=${SERVER_IP:-$DEFAULT_SERVER_IP}

echo -e "\n${YELLOW}--- Google OAuth Credentials ---${NC}"
read -p "Enter Google Client ID: " GOOGLE_CLIENT_ID
read -s -p "Enter Google Client Secret (Input will be hidden): " GOOGLE_CLIENT_SECRET
echo ""

echo -e "\n${YELLOW}--- Gemini API Configuration ---${NC}"
read -s -p "Enter Gemini API Key (Input will be hidden): " GEMINI_API_KEY
echo ""

echo -e "\n${GREEN}Generating secure secrets...${NC}"
# Generate random strings
if command -v openssl >/dev/null 2>&1; then
    JWT_SECRET=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -hex 16)
else
    JWT_SECRET=$(LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 64)
    POSTGRES_PASSWORD=$(LC_ALL=C tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c 32)
fi

echo -e "${GREEN}Writing root .env file...${NC}"
cat <<EOF > .env
VITE_CALENDAR_API_URL=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
REDIRECT_URI=http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}/api/calendar/oauth2callback
JWT_SECRET=${JWT_SECRET}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DB=mongodb://mongodb:27017/pm-tool
EOF

echo -e "${GREEN}Writing frontend/.env file...${NC}"
mkdir -p frontend
cat <<EOF > frontend/.env
GEMINI_API_KEY="${GEMINI_API_KEY}"
VITE_PRODUCT_KEY_API_URL="http://${SERVER_IP}:${DEFAULT_PRODUCT_KEY_PORT}"
VITE_CALENDAR_API_URL="http://${SERVER_IP}:${DEFAULT_CALENDAR_PORT}"
EOF

echo -e "\n${GREEN}Environment files created successfully.${NC}"
echo -e "${GREEN}Starting Docker containers...${NC}"

if command -v docker-compose >/dev/null 2>&1; then
    # Some older linux environments need sudo for docker
    if groups | grep -q docker || [ "$EUID" -eq 0 ] || [ "$OS" = "Darwin" ]; then
        docker-compose up -d --build
    else
        sudo docker-compose up -d --build
    fi
else
    if groups | grep -q docker || [ "$EUID" -eq 0 ] || [ "$OS" = "Darwin" ]; then
        docker compose up -d --build
    else
        sudo docker compose up -d --build
    fi
fi

echo -e "\n${CYAN}==========================================${NC}"
echo -e "${GREEN}Installation complete!${NC}"
echo -e "${GREEN}Frontend is accessible at: http://${SERVER_IP}:3077${NC}"
echo -e "${CYAN}==========================================${NC}"
