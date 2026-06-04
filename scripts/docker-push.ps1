Write-Host "Building Docker images..." -ForegroundColor Cyan

Write-Host "Building frontend..."
docker build -t shamiltp/pm-tool-frontend:latest ./frontend

Write-Host "Building calendar backend..."
docker build -t shamiltp/pm-tool-calendar:latest ./backend/calender

Write-Host "Building product-key backend..."
docker build -t shamiltp/pm-tool-product-key:latest ./backend/product-key

Write-Host "Building core backend..."
docker build -t shamiltp/pm-tool-core-backend:latest ./backend/core

Write-Host "Pushing Docker images to Docker Hub..." -ForegroundColor Cyan

Write-Host "Pushing frontend..."
docker push shamiltp/pm-tool-frontend:latest

Write-Host "Pushing calendar backend..."
docker push shamiltp/pm-tool-calendar:latest

Write-Host "Pushing product-key backend..."
docker push shamiltp/pm-tool-product-key:latest

Write-Host "Pushing core backend..."
docker push shamiltp/pm-tool-core-backend:latest

Write-Host "All images built and pushed successfully!" -ForegroundColor Green
