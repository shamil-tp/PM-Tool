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
git clone <your-repository-url>
cd pm-tool
```

*(If you have already downloaded the code, simply navigate to the `pm-tool` directory in your terminal.)*

---

## ⚙️ Step 2: Configure Environment Variables

The application relies on environment variables for configuration. You need to set up two separate `.env` files before building the containers.

### 2.1 Root Environment Variables (Backend & Databases)

You can quickly generate your root `.env` file directly from the command line by substituting your actual values (like your IP address and secrets) into the commands below.

**For macOS / Linux (Bash):**
```bash
cat <<EOF > .env
VITE_CALENDAR_API_URL=http://your-server-ip:5001
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
REDIRECT_URI=http://your-server-ip:5001/api/calendar/oauth2callback
JWT_SECRET=your-secure-random-string
POSTGRES_PASSWORD=your-secure-db-password
DB=mongodb://mongodb:27017/pm-tool
EOF
```

**For Windows (PowerShell):**
```powershell
Set-Content -Path .env -Value @"
VITE_CALENDAR_API_URL=http://your-server-ip:5001
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
REDIRECT_URI=http://your-server-ip:5001/api/calendar/oauth2callback
JWT_SECRET=your-secure-random-string
POSTGRES_PASSWORD=your-secure-db-password
DB=mongodb://mongodb:27017/pm-tool
"@
```
*(Alternatively, you can manually copy `.env.example` to `.env` and edit it using your favorite text editor.)*

### 2.2 Frontend Environment Variables

The React frontend (built with Vite) requires its own environment variables baked in at build time.

Navigate to the `frontend` directory and create the `.env` file using your terminal.

**For macOS / Linux (Bash):**
```bash
cd frontend
cat <<EOF > .env
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
VITE_PRODUCT_KEY_API_URL="http://your-server-ip:5002"
VITE_CALENDAR_API_URL="http://your-server-ip:5001"
EOF
cd ..
```

**For Windows (PowerShell):**
```powershell
cd frontend
Set-Content -Path .env -Value @"
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
VITE_PRODUCT_KEY_API_URL="http://your-server-ip:5002"
VITE_CALENDAR_API_URL="http://your-server-ip:5001"
"@
cd ..
```
*(Alternatively, you can manually copy `frontend/.env.example` to `frontend/.env` and edit it.)*

> **⚠️ CRITICAL WARNING:** Because the frontend is a statically built React application, **any changes to `frontend/.env` require a complete rebuild of the frontend container** for the changes to take effect.

---

## 🐳 Step 3: Start the Containers

With your environment variables configured, you are ready to start the application. 

Make sure you are in the root `pm-tool` directory, then run:

```bash
docker-compose up -d --build
```

### What happens now?
1. Docker will download the necessary base images (Node, Postgres, MongoDB, Nginx).
2. It will build the custom images for the frontend and all three backend services.
3. The databases (Postgres & MongoDB) will start first. Health checks are configured to ensure they are fully ready before the backends attempt to connect.
4. The backends will connect to the databases.
5. The frontend will be served via a lightweight Nginx web server.

> *Note: The first time you run this command, it may take several minutes to download and build everything.*

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
