# Docker Guide for PM-Tool

Welcome! This guide is designed for beginners who have never used Docker before. It will walk you through exactly what Docker is, how to install it, and how to get your application running on any server.

---

## What is Docker?

Imagine trying to share a cake recipe with a friend, but they have a different oven, different brands of flour, and different measuring cups. The cake might not turn out the same! 

**Docker** solves this problem for software. It bundles your code and *everything* it needs to run (like Node.js, libraries, and settings) into a neat package called a **Container**.
Because a container includes everything, it will run exactly the same way on *your laptop* as it does on *any cloud server*. No more "it works on my machine!"

**Docker Compose** is a tool that lets you run *multiple* containers at the same time using a single configuration file (`docker-compose.yml`). In our case, we are running:
1. The Frontend (Vite/React)
2. The Calendar Backend (Node.js)
3. The Product Key Backend (Node.js)
4. A MongoDB Database
5. A PostgreSQL Database

---

## 1. Installing Docker on a New Server

Before you can run the app, you need to install Docker on your server.

**For Ubuntu/Debian Linux Servers (Most Common):**
Open your server's terminal and run these commands one by one:
```bash
# Update your server's package list
sudo apt-get update

# Install Docker
sudo apt-get install -y docker.io docker-compose

# Start the Docker service
sudo systemctl start docker
sudo systemctl enable docker
```

*(Note: If you are using Windows or Mac locally, you can just download "Docker Desktop" from the official Docker website).*

---

## 2. Running Your Application

Once Docker is installed, running your entire application takes just **one command**.

1. Open your terminal and navigate to your project folder (where `docker-compose.yml` is located):
   ```bash
   cd /path/to/your/pm-tool
   ```

2. **Set up your environment variables:**
   You will see a file named `.env.example`. You need to copy this to a new file named `.env` and fill in your actual passwords and keys.
   ```bash
   cp .env.example .env
   nano .env
   ```
   *(Fill in your details, then press `Ctrl+O`, `Enter`, and `Ctrl+X` to save and exit).*

3. Run this magic command:
   ```bash
   sudo docker-compose up --build -d
   ```
   
   **What does this command do?**
   - `up`: Starts the containers.
   - `--build`: Tells Docker to build the latest version of your code based on the `Dockerfile`s we created.
   - `-d`: Stands for "detached". It runs the containers in the background so you can continue using your terminal.

That's it! Your app is now running.
- **Frontend:** http://your-server-ip:3000
- **Calendar API:** http://your-server-ip:5001
- **Product Key API:** http://your-server-ip:5002

---

## 3. Useful Commands for Maintenance

Here are the everyday commands you will need to manage your app in the future:

### See what is running
To see a list of your running containers:
```bash
sudo docker-compose ps
```

### View the logs (Troubleshooting)
If something isn't working, you can view the live logs (like a console output) for your containers:
```bash
# View logs for all containers
sudo docker-compose logs -f

# View logs for a specific container (e.g., calendar-backend)
sudo docker-compose logs -f calendar-backend
```
*(Press `Ctrl+C` to stop watching the logs).*

### Stopping the app
If you need to turn the application off:
```bash
sudo docker-compose down
```

### Updating the app with new code
When you make changes to your frontend or backend code and want to deploy the update:
1. Pull your latest code (e.g., `git pull`)
2. Rebuild and restart the containers:
   ```bash
   sudo docker-compose up --build -d
   ```
   Docker is smart—it will only restart the containers that actually had code changes!

---

## Troubleshooting FAQ

**Q: A container says it is "restarting" constantly.**
A: This usually means the app crashed. Run `sudo docker-compose logs -f <container-name>` to see the exact error message.

**Q: I changed my `.env` file but the app didn't update.**
A: Docker caches environment variables. You need to run `sudo docker-compose up -d` to apply new `.env` settings.

**Q: How do I completely wipe everything and start fresh?**
A: **WARNING:** This will delete your local database data!
```bash
sudo docker-compose down -v
```
---

## 4. Pushing Your App to Docker Hub (For Remote Servers)

If you don't want to copy your entire source code to your server, you can build the "images" on your laptop and push them to Docker Hub (like GitHub, but for Docker).

**Step 1: Create a Docker Hub account**
Go to [hub.docker.com](https://hub.docker.com/) and create a free account. Note your `username`.

**Step 2: Login to Docker on your laptop**
Open your terminal and run:
```bash
docker login
```
*(Enter your username and password).*

**Step 3: Build and Tag your images**
You need to prefix your image names with your Docker Hub username. Run these commands from your project root:
```bash
# Build Frontend
docker build -t yourusername/pm-tool-frontend ./frontend

# Build Calendar Backend
docker build -t yourusername/pm-tool-calendar ./backend/calender

# Build Product Key Backend
docker build -t yourusername/pm-tool-product-key ./backend/product-key
```

**Step 4: Push the images to Docker Hub**
```bash
docker push yourusername/pm-tool-frontend
docker push yourusername/pm-tool-calendar
docker push yourusername/pm-tool-product-key
```

**Step 5: Run it on your server!**
On your remote server, you don't need the source code. You just need a `.env` file and a modified `docker-compose.yml` that uses `image:` instead of `build:`. 
For example, in your server's `docker-compose.yml`:
```yaml
  frontend:
    image: yourusername/pm-tool-frontend:latest
    ports:
      - "3000:80"
```
Then just run `docker-compose up -d` on the server, and it will download your pre-built app!
