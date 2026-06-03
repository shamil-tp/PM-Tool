#!/bin/bash

echo "Checking system compatibility..."

# Check if the CPU supports AVX
if grep -q "avx" /proc/cpuinfo; then
    echo "AVX support detected. Using MongoDB 6.0..."
    export MONGO_VERSION="6.0"
else
    echo "No AVX support detected. Falling back to MongoDB 4.4..."
    export MONGO_VERSION="4.4"
fi

echo "Starting PM-Tool stack..."
docker compose -f docker-compose.prod.yml up -d
