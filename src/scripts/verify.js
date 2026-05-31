const app = require("../app");
const { sequelize } = require("../config/db");

require("../models/associations");

const PORT = 3001;
const BASE_URL = `http://127.0.0.1:${PORT}/api`;

const logCheck = (name, passed, detail = "") => {
  const label = passed ? "PASS" : "FAIL";
  console.log(`[${label}] ${name}${detail ? ` - ${detail}` : ""}`);
};

const request = async (path, options = {}) => {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
};

const authHeader = (token) => ({
  Authorization: `Bearer ${token}`,
});

const assertCheck = (name, condition, detail = "") => {
  logCheck(name, condition, detail);
  if (!condition) {
    throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  }
};

const runTests = async () => {
  let server;
  let exitCode = 0;

  try {
    console.log("Preparing test database...");
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    server = app.listen(PORT, () => {
      console.log(`Test server running on port ${PORT}`);
    });

    const adminEmail = `admin-${Date.now()}@tracker.com`;
    const managerEmail = `manager-${Date.now()}@tracker.com`;
    const memberEmail = `member-${Date.now()}@tracker.com`;
    const otherMemberEmail = `other-${Date.now()}@tracker.com`;

    const { response: registerRes, data: registerData } = await request("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Alice Admin",
        email: adminEmail,
        password: "password123",
        organizationName: "Acme Corp",
      }),
    });

    assertCheck(
      "auth register returns admin and token pair",
      registerRes.status === 201 && registerData.user.role === "ADMIN" && registerData.accessToken && registerData.refreshToken
    );

    const { response: refreshRes, data: refreshData } = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: registerData.refreshToken }),
    });

    assertCheck(
      "refresh token rotation returns a new pair",
      refreshRes.status === 200 && refreshData.accessToken && refreshData.refreshToken
    );

    const { response: reusedRefreshRes } = await request("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: registerData.refreshToken }),
    });

    assertCheck("old refresh token cannot be reused", reusedRefreshRes.status === 401);

    const adminToken = registerData.accessToken;

    const { data: manager } = await request("/users", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: "Bob Manager",
        email: managerEmail,
        password: "password123",
        role: "MANAGER",
      }),
    });

    const { data: member } = await request("/users", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: "Charlie Member",
        email: memberEmail,
        password: "password123",
        role: "MEMBER",
      }),
    });

    const { data: otherMember } = await request("/users", {
      method: "POST",
      headers: authHeader(adminToken),
      body: JSON.stringify({
        name: "Dana Member",
        email: otherMemberEmail,
        password: "password123",
        role: "MEMBER",
      }),
    });

    const { data: managerLogin } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: managerEmail, password: "password123" }),
    });

    const { data: memberLogin } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: memberEmail, password: "password123" }),
    });

    const { data: otherMemberLogin } = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: otherMemberEmail, password: "password123" }),
    });

    const { data: project } = await request("/projects", {
      method: "POST",
      headers: authHeader(managerLogin.accessToken),
      body: JSON.stringify({
        name: "Alpha Project",
        description: "Integration test project",
      }),
    });

    const { response: taskRes, data: task } = await request("/tasks", {
      method: "POST",
      headers: authHeader(managerLogin.accessToken),
      body: JSON.stringify({
        title: "Build task workflow",
        description: "Validate assignment-critical task behavior",
        priority: "MEDIUM",
        assignee: member.id,
        projectId: project.id,
        due_date: new Date(Date.now() + 86400000).toISOString(),
      }),
    });

    assertCheck("manager can create task for organization member", taskRes.status === 201 && task.id);

    const { response: deniedTaskRes } = await request(`/tasks/${task.id}`, {
      headers: authHeader(otherMemberLogin.accessToken),
    });

    assertCheck("member cannot access another member's task", deniedTaskRes.status === 403);

    const { response: invalidTransitionRes } = await request(`/tasks/${task.id}/status`, {
      method: "PATCH",
      headers: authHeader(memberLogin.accessToken),
      body: JSON.stringify({ status: "DONE" }),
    });

    assertCheck("invalid task status transition is rejected", invalidTransitionRes.status === 400);

    const { response: validTransitionRes, data: updatedTask } = await request(`/tasks/${task.id}/status`, {
      method: "PATCH",
      headers: authHeader(memberLogin.accessToken),
      body: JSON.stringify({ status: "IN_PROGRESS" }),
    });

    assertCheck(
      "assignee can advance task through allowed transition",
      validTransitionRes.status === 200 && updatedTask.status === "IN_PROGRESS"
    );

    const { response: managerTransitionRes, data: managerUpdatedTask } = await request(`/tasks/${task.id}/status`, {
      method: "PATCH",
      headers: authHeader(managerLogin.accessToken),
      body: JSON.stringify({ status: "IN_REVIEW" }),
    });

    assertCheck(
      "manager can advance task status",
      managerTransitionRes.status === 200 && managerUpdatedTask.status === "IN_REVIEW"
    );

    console.log("Verification completed successfully.");
  } catch (error) {
    exitCode = 1;
    console.error("Verification failed:", error.message);
  } finally {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await sequelize.close();
    process.exit(exitCode);
  }
};

runTests();
