# PM-Tool

Welcome to PM-Tool! This repository contains a fully containerized microservices architecture encompassing a React/Vite frontend and multiple Node.js backend services (Calendar, Product Key, and Core). The system uses PostgreSQL and MongoDB for persistent data storage.

This guide provides a bulletproof, step-by-step walkthrough to get the application running locally or on a server using Docker.

## 📋 Prerequisites

Before you begin, ensure you have the following installed on your host machine:

- **Git**: For cloning the repository.
- **Docker**: Engine to run the containers.
- **Docker Compose**: Tool for defining and running multi-container Docker applications.

---

## 🚀 Step 1: Clone the Repository

Open your terminal or command prompt and clone the repository to your local machine:

```bash
git clone https://github.com/shamil-tp/PM-Tool.git
cd pm-tool
```

*(If you have already downloaded the code, simply navigate to the `pm-tool` directory in your terminal.)*

---

## ⚙️ Step 2: Run the Installer

To automatically configure the environment variables and start the containers, we provide an interactive installer script.

**For macOS / Linux:**
```bash
chmod +x install.sh
./install.sh
```

**For Windows (PowerShell):**
```powershell
.\install.ps1
```

The script will prompt you for necessary credentials (like Google OAuth and Gemini API Key), generate secure secrets, create the required `.env` files, and automatically start the Docker containers.

### What happens now?
1. The script writes your configuration to `.env` and `frontend/.env`.
2. Docker will download the necessary base images (Node, Postgres, MongoDB, Nginx).
3. It will build the custom images for the frontend and all three backend services.
4. The databases (Postgres & MongoDB) will start first. Health checks are configured to ensure they are fully ready before the backends attempt to connect.
5. The backends will connect to the databases.
6. The frontend will be served via a lightweight Nginx web server.

> *Note: The first time you run the script, it may take several minutes to download and build everything.*

---

## 🌐 Step 4: Access the Application

Once Docker finishes building and starting the containers, the services will be available at the following addresses:

| Service | Address |
| :--- | :--- |
| **Frontend (Web App)** | [http://localhost:3077](http://localhost:3077) |
| **Calendar Backend API** | `http://localhost:5001` |
| **Product Key Backend API** | `http://localhost:5002` |
| **Core Backend API** | `http://localhost:5003` |

Open your web browser and navigate to **http://localhost:3077** to view the application!

---

## 🛑 Managing the Application

### Viewing Logs
If something isn't working, check the logs to see what went wrong:
```bash
# View logs for all containers
docker-compose logs -f

# View logs for a specific container (e.g., the core backend)
docker-compose logs -f core-backend
```

### Stopping the Application
To gracefully stop the application without deleting your data:
```bash
docker-compose down
```

### Complete Reset (Delete All Data)
If you need to start completely fresh and **wipe the databases**, you can bring down the containers and remove the storage volumes:
```bash
docker-compose down -v
```

---

## 🛠️ Troubleshooting

- **Database Connection Refused:** This usually happens if the backend starts faster than the database. Docker compose health checks normally prevent this, but if it happens, simply restart the backends: `docker-compose restart core-backend calendar-backend product-key-backend`.
- **Frontend not reflecting `.env` changes:** Remember that Vite bakes environment variables into the static files during the build step. If you changed `frontend/.env`, you must rebuild the frontend container: `docker-compose up -d --build frontend`.
- **Port Conflicts:** If ports `3077`, `5001`, `5002`, `5003`, `5432`, or `27017` are already in use on your machine, the containers will fail to start. You will need to stop the conflicting processes or change the port mappings in `docker-compose.yml`.
