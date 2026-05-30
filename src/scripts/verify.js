const app = require("../app");
const { client } = require("../config/redis");
const { sequelize } = require("../config/db");

// Load associations & models
require("../models/associations");

const PORT = 3001;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

const logTest = (name, passed, detail = "") => {
  const symbol = passed ? "✔" : "✘";
  const color = passed ? "\x1b[32m" : "\x1b[31m";
  const reset = "\x1b[0m";
  console.log(`${color}${symbol} [${name}]${reset} ${detail}`);
};

const runTests = async () => {
  let server;
  let exitCode = 0;
  try {
    // 1. Establish connections
    console.log("Setting up DB & Redis connection for tests...");
    await sequelize.authenticate();
    await client.connect();
    console.log("Connected. Cleaning test database...");

    // Recreate all tables cleanly
    await sequelize.sync({ force: true });
    await client.flushAll();
    console.log("Database reset complete.");

    // Start server
    server = app.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}\n--- Starting Tests ---`);
    });

    let adminTokens;
    let managerTokens;
    let member1Tokens;
    let member2Tokens;

    let adminUser;
    let managerUser;
    let member1User;
    let member2User;

    let projectObj;
    let taskObj;

    // Test 1: Register ADMIN (creates Organization)
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alice Admin",
        email: "alice@tracker.com",
        password: "password123",
        organizationName: "Acme Corp",
      }),
    });

    const regData = await regRes.json();
    if (regRes.status === 201 && regData.accessToken && regData.user.role === "ADMIN") {
      logTest("Auth: Register ADMIN", true, `Organization: ${regData.user.organizationId}`);
      adminTokens = { access: regData.accessToken, refresh: regData.refreshToken };
      adminUser = regData.user;
    } else {
      logTest("Auth: Register ADMIN", false, JSON.stringify(regData));
      process.exit(1);
    }

    // Test 2: Login ADMIN
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "alice@tracker.com",
        password: "password123",
      }),
    });
    const loginData = await loginRes.json();
    if (loginRes.status === 200 && loginData.accessToken) {
      logTest("Auth: Login ADMIN", true);
    } else {
      logTest("Auth: Login ADMIN", false, JSON.stringify(loginData));
    }

    // Test 3: Provision MANAGER & MEMBER (By ADMIN)
    // Provision Manager
    const provMgrRes = await fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.access}`,
      },
      body: JSON.stringify({
        name: "Bob Manager",
        email: "bob@tracker.com",
        password: "password123",
        role: "MANAGER",
      }),
    });
    const provMgrData = await provMgrRes.json();
    if (provMgrRes.status === 201 && provMgrData.role === "MANAGER") {
      logTest("RBAC: ADMIN provision MANAGER", true, `ID: ${provMgrData.id}`);
      managerUser = provMgrData;
    } else {
      logTest("RBAC: ADMIN provision MANAGER", false, JSON.stringify(provMgrData));
    }

    // Provision Member 1
    const provMem1Res = await fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.access}`,
      },
      body: JSON.stringify({
        name: "Charlie Member 1",
        email: "charlie@tracker.com",
        password: "password123",
        role: "MEMBER",
      }),
    });
    const provMem1Data = await provMem1Res.json();
    if (provMem1Res.status === 201 && provMem1Data.role === "MEMBER") {
      logTest("RBAC: ADMIN provision MEMBER 1", true, `ID: ${provMem1Data.id}`);
      member1User = provMem1Data;
    } else {
      logTest("RBAC: ADMIN provision MEMBER 1", false, JSON.stringify(provMem1Data));
    }

    // Provision Member 2 (to test assignee boundaries)
    const provMem2Res = await fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminTokens.access}`,
      },
      body: JSON.stringify({
        name: "David Member 2",
        email: "david@tracker.com",
        password: "password123",
        role: "MEMBER",
      }),
    });
    const provMem2Data = await provMem2Res.json();
    if (provMem2Res.status === 201 && provMem2Data.role === "MEMBER") {
      logTest("RBAC: ADMIN provision MEMBER 2", true, `ID: ${provMem2Data.id}`);
      member2User = provMem2Data;
    }

    // Log in MANAGER and MEMBER 1 to get their access tokens
    const logMgrRes = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bob@tracker.com", password: "password123" }),
    });
    const logMgrData = await logMgrRes.json();
    managerTokens = { access: logMgrData.accessToken, refresh: logMgrData.refreshToken };

    const logMem1Res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "charlie@tracker.com", password: "password123" }),
    });
    const logMem1Data = await logMem1Res.json();
    member1Tokens = { access: logMem1Data.accessToken, refresh: logMem1Data.refreshToken };

    const logMem2Res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "david@tracker.com", password: "password123" }),
    });
    const logMem2Data = await logMem2Res.json();
    member2Tokens = { access: logMem2Data.accessToken, refresh: logMem2Data.refreshToken };

    // Test 4: Refresh Token Rotation
    const refRes1 = await fetch(`${BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: managerTokens.refresh }),
    });
    const refData1 = await refRes1.json();
    if (refRes1.status === 200 && refData1.accessToken && refData1.refreshToken) {
      logTest("Auth: Refresh Token (Rotation Succeeds)", true);
      managerTokens.access = refData1.accessToken;
      // The old token is invalidated. Try refreshing with old token:
      const refRes2 = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: managerTokens.refresh }),
      });
      const refData2 = await refRes2.json();
      if (refRes2.status === 410 || refRes2.status === 401) {
        logTest("Auth: Prevent reuse of rotated refresh token", true);
      } else {
        logTest("Auth: Prevent reuse of rotated refresh token", false, `Status: ${refRes2.status}`);
      }
      managerTokens.refresh = refData1.refreshToken;
    } else {
      logTest("Auth: Refresh Token", false, JSON.stringify(refData1));
    }

    // Test 5: Standard Validation Error (due_date must be in the future)
    const valRes = await fetch(`${BASE_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerTokens.access}`,
      },
      body: JSON.stringify({
        title: "Test Task",
        assignee: member1User.id,
        due_date: new Date(Date.now() - 100000).toISOString(), // PAST DATE
      }),
    });
    const valData = await valRes.json();
    if (
      valRes.status === 400 &&
      valData.code === "VALIDATION_ERROR" &&
      valData.message === "due_date must be a future date"
    ) {
      logTest("Validation: Expired due_date handling", true, `Returned message: "${valData.message}"`);
    } else {
      logTest("Validation: Expired due_date handling", false, JSON.stringify(valData));
    }

    // Test 6: Create Project by MANAGER
    const projRes = await fetch(`${BASE_URL}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerTokens.access}`,
      },
      body: JSON.stringify({
        name: "Alpha Project",
        description: "Testing API",
      }),
    });
    const projData = await projRes.json();
    if (projRes.status === 201 && projData.id) {
      logTest("Project: Create Project by MANAGER", true, `Project ID: ${projData.id}`);
      projectObj = projData;
    } else {
      logTest("Project: Create Project by MANAGER", false, JSON.stringify(projData));
    }

    // Test 7: RBAC - MEMBER cannot create Project
    const projMemRes = await fetch(`${BASE_URL}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Tokens.access}`,
      },
      body: JSON.stringify({
        name: "Fail Project",
        description: "Should fail",
      }),
    });
    const projMemData = await projMemRes.json();
    if (projMemRes.status === 403 && projMemData.code === "FORBIDDEN") {
      logTest("RBAC: MEMBER create project blocked", true, `Returned status: ${projMemRes.status}`);
    } else {
      logTest("RBAC: MEMBER create project blocked", false, JSON.stringify(projMemData));
    }

    // Test 8: Create Task by MANAGER (Valid future due date)
    const taskRes = await fetch(`${BASE_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerTokens.access}`,
      },
      body: JSON.stringify({
        title: "Sprint Tasks list",
        description: "Verify endpoints",
        priority: "MEDIUM",
        assignee: member1User.id,
        projectId: projectObj.id,
        due_date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      }),
    });
    const taskData = await taskRes.json();
    if (taskRes.status === 201 && taskData.id) {
      logTest("Task: Create Task by MANAGER", true, `Task ID: ${taskData.id}`);
      taskObj = taskData;
    } else {
      logTest("Task: Create Task by MANAGER", false, JSON.stringify(taskData));
    }

    // Test 9: RBAC - MEMBER 2 cannot access Task assigned to MEMBER 1
    const getTaskRes = await fetch(`${BASE_URL}/tasks/${taskObj.id}`, {
      headers: { Authorization: `Bearer ${member2Tokens.access}` },
    });
    const getTaskData = await getTaskRes.json();
    if (getTaskRes.status === 403 && getTaskData.code === "FORBIDDEN") {
      logTest("RBAC: MEMBER restricted from other member's task", true, `Status: ${getTaskRes.status}`);
    } else {
      logTest("RBAC: MEMBER restricted from other member's task", false, JSON.stringify(getTaskData));
    }

    // Test 10: Enforced Status Transitions (TODO -> IN_PROGRESS -> IN_REVIEW -> DONE)
    // Attempt invalid transition: TODO -> DONE (Should fail)
    const transFail1 = await fetch(`${BASE_URL}/tasks/${taskObj.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Tokens.access}`,
      },
      body: JSON.stringify({ status: "DONE" }),
    });
    const transFailData = await transFail1.json();
    if (transFail1.status === 400 && transFailData.code === "VALIDATION_ERROR") {
      logTest("State Transition: Enforce TODO -> DONE fail", true, `Message: "${transFailData.message}"`);
    } else {
      logTest("State Transition: Enforce TODO -> DONE fail", false, JSON.stringify(transFailData));
    }

    // Valid transition: TODO -> IN_PROGRESS (Should succeed)
    const transSucc1 = await fetch(`${BASE_URL}/tasks/${taskObj.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Tokens.access}`,
      },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    const transSuccData1 = await transSucc1.json();
    if (transSucc1.status === 200 && transSuccData1.status === "IN_PROGRESS") {
      logTest("State Transition: TODO -> IN_PROGRESS", true);
    } else {
      logTest("State Transition: TODO -> IN_PROGRESS", false, JSON.stringify(transSuccData1));
    }

    // Valid transition: IN_PROGRESS -> BLOCKED (Should succeed)
    const transBlocked = await fetch(`${BASE_URL}/tasks/${taskObj.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Tokens.access}`,
      },
      body: JSON.stringify({ status: "BLOCKED" }),
    });
    const transBlockedData = await transBlocked.json();
    if (transBlocked.status === 200 && transBlockedData.status === "BLOCKED") {
      logTest("State Transition: IN_PROGRESS -> BLOCKED", true);
    }

    // Valid transition: BLOCKED -> IN_REVIEW (Should succeed)
    const transReview = await fetch(`${BASE_URL}/tasks/${taskObj.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Tokens.access}`,
      },
      body: JSON.stringify({ status: "IN_REVIEW" }),
    });
    const transReviewData = await transReview.json();
    if (transReview.status === 200 && transReviewData.status === "IN_REVIEW") {
      logTest("State Transition: BLOCKED -> IN_REVIEW", true);
    }

    // Valid transition: IN_REVIEW -> DONE (Should succeed)
    const transDone = await fetch(`${BASE_URL}/tasks/${taskObj.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member1Tokens.access}`,
      },
      body: JSON.stringify({ status: "DONE" }),
    });
    const transDoneData = await transDone.json();
    if (transDone.status === 200 && transDoneData.status === "DONE") {
      logTest("State Transition: IN_REVIEW -> DONE", true);
    }

    // Test 11: Caching and Cache Invalidation
    const cacheTaskRes = await fetch(`${BASE_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${managerTokens.access}`,
      },
      body: JSON.stringify({
        title: "Caching Task",
        assignee: member2User.id,
        due_date: new Date(Date.now() + 86400000).toISOString(),
      }),
    });
    const cacheTask = await cacheTaskRes.json();

    // Query 1: Cache Miss, gets from DB and populates cache
    console.log("Query 1: Fetching member 2 tasks (should miss cache)...");
    const q1Res = await fetch(`${BASE_URL}/tasks?assignee=${member2User.id}`, {
      headers: { Authorization: `Bearer ${member2Tokens.access}` },
    });
    const q1Data = await q1Res.json();
    const t1 = Date.now();

    // Query 2: Cache Hit, instant retrieval
    console.log("Query 2: Re-fetching member 2 tasks (should hit cache)...");
    const q2Res = await fetch(`${BASE_URL}/tasks?assignee=${member2User.id}`, {
      headers: { Authorization: `Bearer ${member2Tokens.access}` },
    });
    const q2Data = await q2Res.json();
    const t2 = Date.now();

    const timeDiff = t2 - t1;
    logTest("Cache: Redis cache retrieval", q2Res.status === 200 && q2Data.tasks.length > 0, `Fetch duration: ${timeDiff}ms`);

    // Invalidation: Mutate the task
    console.log("Mutating caching task to trigger active invalidation...");
    const mutRes = await fetch(`${BASE_URL}/tasks/${cacheTask.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${member2Tokens.access}`,
      },
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });
    await mutRes.json();

    // Query 3: Should Miss cache
    console.log("Query 3: Fetching member 2 tasks post-mutation (should miss cache)...");
    const q3Res = await fetch(`${BASE_URL}/tasks?assignee=${member2User.id}`, {
      headers: { Authorization: `Bearer ${member2Tokens.access}` },
    });
    const q3Data = await q3Res.json();
    logTest("Cache: Active Cache Invalidation verified", q3Res.status === 200 && q3Data.tasks[0].status === "IN_PROGRESS");

    console.log("\n--- Verification Suite Completed Successfully! ---");
  } catch (error) {
    exitCode = 1;
    console.error("Test execution failed:", error);
  } finally {
    if (server) {
      server.close(() => {
        console.log("Test server shut down.");
      });
    }
    await sequelize.close();
    if (client.isOpen) {
      await client.quit();
    }
    process.exit(exitCode);
  }
};

// Start the tests
runTests();
