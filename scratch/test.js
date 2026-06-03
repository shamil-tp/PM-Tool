const http = require('http');

function request(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 5003,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = http.request(options, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    try {
        console.log("--- Starting Postgres CRUD API Tests ---");
        
        // 1. Register a test user
        const timestamp = Date.now();
        const username = `testuser_${timestamp}`;
        const email = `testuser_${timestamp}@example.com`;
        
        console.log(`\nRegistering user: ${username}`);
        const regRes = await request('POST', '/api/auth/register', {
            username,
            email,
            password: 'password123',
            full_name: 'Test User'
        });
        
        if (regRes.status !== 200) {
            throw new Error(`Registration failed: ${JSON.stringify(regRes.data)}`);
        }
        console.log("Registration successful.");
        const token = regRes.data.accessToken;

        // 2. Create a test record (using tasks table or a dummy table, assuming tasks exists)
        console.log("\nCreating a record (POST /api/tasks)...");
        // We'll just put something minimal, many constraints might apply to tasks (like project_id).
        // If tasks fails due to FK, we'll see it. Let's try inserting into 'users' or another table without strict constraints,
        // Actually, we can try creating a workspace first.
        
        const wsRes = await request('POST', '/api/workspaces', {
            name: `Test Workspace ${timestamp}`,
            slug: `test-workspace-${timestamp}`
        }, token);
        
        let workspaceId = null;
        if (wsRes.status === 200 && wsRes.data.length > 0) {
            console.log("Workspace created successfully.");
            workspaceId = wsRes.data[0].id;
        } else {
            console.log("Failed to create workspace:", wsRes.status, wsRes.data);
            // It might fail if workspaces table doesn't exist or has constraints, we'll see.
        }

        console.log("\nFetching users (GET /api/users?limit=1)...");
        const getRes = await request('GET', '/api/users?limit=1', null, token);
        if (getRes.status === 200) {
            console.log("GET successful.", getRes.data);
        } else {
            throw new Error(`GET failed: ${JSON.stringify(getRes.data)}`);
        }
        
        console.log("\nUpdating user (PATCH /api/users?id=eq.[id])...");
        const patchRes = await request('PATCH', `/api/users?id=eq.${regRes.data.user.id}`, {
            full_name: 'Updated Test User'
        }, token);
        if (patchRes.status === 200) {
            console.log("PATCH successful.", patchRes.data);
        } else {
            console.log("PATCH failed:", patchRes.status, patchRes.data);
        }

        console.log("\nDeleting user (DELETE /api/users?id=eq.[id])...");
        const delRes = await request('DELETE', `/api/users?id=eq.${regRes.data.user.id}`, null, token);
        if (delRes.status === 200) {
            console.log("DELETE successful.", delRes.data);
        } else {
            console.log("DELETE failed:", delRes.status, delRes.data);
        }

        console.log("\n--- Checking MongoDB (Calendar Backend) ---");
        const calRes = await request('GET', '/api/calendar/health', null, token);
        // It's on port 5001 usually, wait, request function is hardcoded to 5003. 
        // I will do a fetch directly using run_command later.

        console.log("\nTests finished!");
    } catch (error) {
        console.error("Test error:", error);
    }
}

runTests();
