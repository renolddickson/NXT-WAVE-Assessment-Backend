# Team Task Tracker REST API

A production-ready, secure, and containerized Express.js REST API for team-based task tracking. Featuring multi-tenant boundaries, robust role-based access control (RBAC) implemented cleanly at the middleware level, strictly enforced state transitions, Redis-backed list caching with active invalidation, standardized JSON error formatting, and a full Docker orchestration environment.

This system has been built on top of **PostgreSQL** using the **Sequelize ORM** for strong relational data integrity, strict table constraints, and high-performance database-level indexes.

---

## Architecture & System Design

```mermaid
flowchart TD
    Client[HTTP Client] -->|Bearer JWT / API Request| ExpressApp[Express App / Router]
    ExpressApp -->|1. Auth Middleware| AuthMW[Verify Token & Attach User]
    AuthMW -->|2. RBAC / checkTaskAccess| RbacMW[Authorize & Load Task context]
    RbacMW -->|3. Validator Middleware| JoiMW[Validate Request Payload]
    JoiMW -->|4. Controller Logic| Controller[Task / User / Project Controllers]
    Controller -->|Query Cache| Redis[(Redis Cache)]
    Controller -->|Query Database| PG[(PostgreSQL Database)]
```

---

## 1. Database Design (PostgreSQL)

By migrating from MongoDB to PostgreSQL, we enforce actual database-level schema constraints, automatic primary and foreign keys validations, and highly optimized B-Tree indexes.

### Schema Diagram

```mermaid
erDiagram
    Organizations ||--o{ Users : "has many"
    Organizations ||--o{ Projects : "has many"
    Organizations ||--o{ Tasks : "has many"
    Projects ||--o{ Tasks : "has many"
    Users ||--o{ Tasks : "is assignee of"
    Users ||--o{ RefreshTokens : "owns"

    Organizations {
        UUID id PK
        VARCHAR name
        TIMESTAMP createdAt
        TIMESTAMP updatedAt
    }

    Users {
        UUID id PK
        VARCHAR name
        VARCHAR email UK
        VARCHAR password
        VARCHAR role "ADMIN | MANAGER | MEMBER"
        UUID organizationId FK
        TIMESTAMP createdAt
        TIMESTAMP updatedAt
    }

    RefreshTokens {
        UUID id PK
        VARCHAR token UK
        UUID userId FK
        TIMESTAMP expiresAt
        BOOLEAN isRevoked
        TIMESTAMP createdAt
        TIMESTAMP updatedAt
    }

    Projects {
        UUID id PK
        VARCHAR name
        TEXT description
        UUID organizationId FK
        TIMESTAMP createdAt
        TIMESTAMP updatedAt
    }

    Tasks {
        UUID id PK
        VARCHAR title
        TEXT description
        VARCHAR priority "LOW | MEDIUM | HIGH"
        VARCHAR status "TODO | IN_PROGRESS | IN_REVIEW | DONE | BLOCKED"
        UUID assignee FK
        UUID projectId FK
        UUID organizationId FK
        TIMESTAMP due_date
        TIMESTAMP createdAt
        TIMESTAMP updatedAt
    }
```

### Indexed Fields & Performance Rationale

To maintain maximum query speed under production workloads, we declared specific B-Tree indexes on the `Tasks` table:

1. **`User.email` (Unique Index)**
   - **Rationale**: Instantly handles credentials checking during user login.

2. **`Task.organizationId` (Single Index)**
   - **Rationale**: Multi-tenant separation boundary. Scopes all queries by tenant organization, ensuring no leakage of data across entities.

3. **`Task.assignee` (Single Index)**
   - **Rationale**: Extremely heavily queried. Satisfies the `MEMBER` dashboard views (which only see their assigned tasks) and speeds up cache-miss recoveries.

4. **`Task.status` (Single Index)**
   - **Rationale**: Speeds up filtered query lookups on active sprint boards.

5. **`Task.due_date` (Single Index)**
   - **Rationale**: Accelerates sorting tasks based on deadlines without putting load on CPU for in-memory sorting.

6. **Compound Index: `Task (organizationId, assignee, status, priority)`**
   - **Design Decision Documented**: 
     To optimize dashboard listings filtered by assignee, status, and priority (the most common operations for users), we configured a compound index. By grouping these attributes in a single left-to-right prefix matching structure, PostgreSQL satisfies multiple filter options directly from the RAM index tree without performing expensive row scans.

---

## 2. Redis Caching & Invalidation Strategy

To optimize loading times of task dashboards, we use a Redis caching layer for task lists filtered by `assignee`.

### Caching Strategy

- When listing tasks, if the query includes an `assignee` filter (which is *always* true for `MEMBER` roles, and common for managers), a unique cache key is generated:
  `tasks:assignee:<assigneeId>:page:<page>:limit:<limit>:status:<status>:priority:<priority>`
- The application checks Redis. If there is a **Cache Hit**, it parses the cached JSON and returns it immediately.
- If there is a **Cache Miss**, the controller queries PostgreSQL, saves the result to Redis with a **30-minute Time-To-Live (TTL)**, and returns the response.

### Active Invalidation Strategy

We use **Active Cache Invalidation** triggered automatically on any database mutation:

```mermaid
flowchart TD
    Mutation[Create / Update / Delete / Status Advance] --> Target[Identify affected assignee IDs]
    Target --> Invalidate[Scan Redis for matching patterns]
    Invalidate --> Delete[Delete keys 'tasks:assignee:userId:*']
    Delete --> Client[Ensure next request fetches fresh data]
```

1. **Task Creation**: Invalidates the cache for the assigned user (`tasks:assignee:<newAssigneeId>:*`).
2. **Task Update**:
   - If the task's assignee remains unchanged, invalidates the cache for the current assignee.
   - If the task is reassigned from User A to User B, it invalidates **both** the old assignee's cache (`User A`) and the new assignee's cache (`User B`) to prevent stale dashboard counts.
3. **Status Advance**: Invalidates the cache for the task's assignee.
4. **Task Deletion**: Invalidates the cache for the task's assignee.

To execute this efficiently, we use a SCAN-based helper (`invalidateCachePattern`) that scans Redis matching keys iteratively and deletes them in chunks, preventing Redis blockages.

---

## 3. Role-Based Access Control (RBAC)

Authorization is strictly decoupled from business logic and enforced at the **Express Middleware level** before reaching controller operations.

### Permissions Matrix

| Route / Resource | Action | Allowed Roles | Middleware Logic |
| :--- | :--- | :--- | :--- |
| `/api/users/*` | Full Access (CRUD) | `ADMIN` | `requireRole(['ADMIN'])` |
| `/api/projects/*` | Create/Update/Delete | `ADMIN`, `MANAGER` | `requireRole(['ADMIN', 'MANAGER'])` |
| `/api/projects/*` | View List | `ADMIN`, `MANAGER`, `MEMBER` | Scoped to `organizationId` |
| `/api/tasks/*` | Create / Edit / Delete | `ADMIN`, `MANAGER` | `requireRole(['ADMIN', 'MANAGER'])` |
| `/api/tasks/*` | View List / Single | `ADMIN`, `MANAGER`, `MEMBER` | `checkTaskAccess` (forces `MEMBER` to view only assigned tasks) |
| `/api/tasks/:id/status`| Advance Status | `MANAGER`, `assignee` | `checkTaskAccess` + `canAdvanceTaskStatus` middleware |

### Access Control Middleware Code-Design (`checkTaskAccess`)

By utilizing the custom `checkTaskAccess` middleware on individual task routes, we achieve complete isolation of concerns:
1. It validates task existence.
2. It verifies the multi-tenant organization boundary. If the task does not belong to the user's organization, it throws a `NotFoundError` (preventing attackers from sniffing valid resource IDs).
3. If the user is a `MEMBER`, it verifies they are the `assignee`. If not, it throws a `ForbiddenError`.
4. It attaches `req.task` to the request stream, allowing downstream controllers to process the request without querying the database a second time.

---

## 4. Enforced Status Transitions

Rather than allowing free-form updates to task status, we enforce a strict workflow. Any transition must follow these rules:

```mermaid
stateDiagram-v2
    [*] --> TODO
    TODO --> IN_PROGRESS
    TODO --> BLOCKED
    IN_PROGRESS --> IN_REVIEW
    IN_PROGRESS --> BLOCKED
    IN_REVIEW --> DONE
    IN_REVIEW --> BLOCKED
    BLOCKED --> TODO
    BLOCKED --> IN_PROGRESS
    BLOCKED --> IN_REVIEW
    DONE --> [*]
```

### Transition Validation Rules

1. A task can only progress sequentially: `TODO` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `IN_REVIEW` $\rightarrow$ `DONE`.
2. A task can transition into `BLOCKED` from any active state (`TODO`, `IN_PROGRESS`, `IN_REVIEW`).
3. A task can transition back out of `BLOCKED` into any active state.
4. `DONE` is a terminal state. Once completed, the task status cannot be changed.
5. **Role Check**: Only the **assignee** of the task or a **MANAGER** in the organization is permitted to advance the status.

---

## 5. Performance & Error Handling

Standardized, client-parseable error responses are returned consistently across all endpoints.

### Consistent JSON Error Format

All exceptions (validation, unauthenticated, forbidden, not found, conflict, internal) are intercepted by a global Express error-handler and returned in this exact format:

```json
{
  "status": 400,
  "code": "VALIDATION_ERROR",
  "message": "due_date must be a future date"
}
```

### Payload Validation

Using **Joi**, we strictly validate incoming JSON payloads on `body`, `query`, and `params`. Meaningful messages are configured for all schemas:
- `email` must be a valid email format.
- `role` must be one of `ADMIN`, `MANAGER`, `MEMBER`.
- `due_date` must be a future date (`due_date must be a future date`).
- `priority` must be one of `LOW`, `MEDIUM`, `HIGH`.

---

## 6. API Reference

### Authentication

#### Register & Initialize Organization
- **Endpoint**: `POST /api/auth/register`
- **Body**:
  ```json
  {
    "name": "Alice Admin",
    "email": "alice@tracker.com",
    "password": "password123",
    "organizationName": "Acme Corporation"
  }
  ```
- **Returns**: Returns 201 Created with ADMIN user object, access token, and refresh token.

#### Login
- **Endpoint**: `POST /api/auth/login`
- **Body**:
  ```json
  {
    "email": "alice@tracker.com",
    "password": "password123"
  }
  ```
- **Returns**: User details and JWT token pair.

#### Refresh Token (Rotation)
- **Endpoint**: `POST /api/auth/refresh`
- **Body**:
  ```json
  {
    "refreshToken": "<your-refresh-token>"
  }
  ```
- **Returns**: A rotated, fresh pair of `accessToken` and `refreshToken`. (The old refresh token is immediately invalidated to prevent reuse attacks).

#### Logout
- **Endpoint**: `POST /api/auth/logout`
- **Body**:
  ```json
  {
    "refreshToken": "<your-refresh-token>"
  }
  ```

---

### User Administration (ADMIN only)

#### List Organization Users
- **Endpoint**: `GET /api/users`
- **Headers**: `Authorization: Bearer <ADMIN-ACCESS-TOKEN>`

#### Provision User
- **Endpoint**: `POST /api/users`
- **Headers**: `Authorization: Bearer <ADMIN-ACCESS-TOKEN>`
- **Body**:
  ```json
  {
    "name": "Bob Manager",
    "email": "bob@tracker.com",
    "password": "password123",
    "role": "MANAGER"
  }
  ```

#### Update User
- **Endpoint**: `PUT /api/users/:id`
- **Headers**: `Authorization: Bearer <ADMIN-ACCESS-TOKEN>`
- **Body**: Any one or more of `name`, `email`, `password`, `role`.

#### Delete User
- **Endpoint**: `DELETE /api/users/:id`
- **Headers**: `Authorization: Bearer <ADMIN-ACCESS-TOKEN>`

---

### Projects (ADMIN / MANAGER only for writes)

#### List Projects
- **Endpoint**: `GET /api/projects`

#### Create Project
- **Endpoint**: `POST /api/projects`
- **Body**:
  ```json
  {
    "name": "Alpha Sprint",
    "description": "API core development"
  }
  ```

---

### Tasks

#### List Tasks (Paginated, Filtered, Cached)
- **Endpoint**: `GET /api/tasks`
- **Query Params**:
  - `page` (default: 1)
  - `limit` (default: 10)
  - `status` (`TODO`, `IN_PROGRESS`, etc.)
  - `priority` (`LOW`, `MEDIUM`, `HIGH`)
  - `assignee` (User ID - automatically forced to the user's ID if user is a `MEMBER`)

#### Create Task (ADMIN & MANAGER)
- **Endpoint**: `POST /api/tasks`
- **Body**:
  ```json
  {
    "title": "Build RBAC Middleware",
    "description": "Write and test middleware functions in Express",
    "priority": "HIGH",
    "assignee": "<member-user-id>",
    "projectId": "<project-id>",
    "due_date": "2026-06-30T12:00:00.000Z"
  }
  ```

#### Advance Task Status (Assignee or MANAGER)
- **Endpoint**: `PATCH /api/tasks/:id/status`
- **Body**:
  ```json
  {
    "status": "IN_PROGRESS"
  }
  ```

---

## 7. How to Run & Deploy

### Prerequisites
- Node.js (v20 or higher)
- PostgreSQL
- Redis

### Local Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root folder using `.env.example` as a template:
   ```env
   PORT=3000
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/task_tracker
   REDIS_URL=redis://localhost:6379
   JWT_ACCESS_SECRET=your_jwt_access_secret_key_change_me_in_prod
   JWT_ACCESS_EXPIRY=15m
   JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_change_me_in_prod
   JWT_REFRESH_EXPIRY=7d
   ```

3. **Start the Development Server**:
   ```bash
   npm run dev
   ```

4. **Run Integration Tests**:
   Ensure PostgreSQL and Redis are active, then run:
   ```bash
   node src/scripts/verify.js
   ```

   Or use the package script:
   ```bash
   npm test
   ```

5. **API Specification**:
   A Swagger/OpenAPI 3.0 spec is included at `openapi.yaml`. Import it into Swagger UI, Postman, Insomnia, or another API client to inspect and test the endpoints.

---

### Containerized Deployment (Docker Compose)

The entire application stack (Web API, PostgreSQL database, and Redis caching engine) can be orchestrated seamlessly using Docker Compose:

1. **Build and start services**:
   ```bash
   docker compose up --build -d
   ```

2. **Verify running containers**:
   ```bash
   docker ps
   ```

3. **Shut down services**:
   ```bash
   docker compose down
   ```

The compose file includes health checks for PostgreSQL, Redis, and the web service. The API waits for PostgreSQL and Redis to become healthy before starting, and the Node process also retries PostgreSQL connection attempts during startup.

---

## 8. What I Would Improve Given More Time

- Add a formal migration system with Sequelize migrations instead of `sequelize.sync({ alter: true })`.
- Add broader automated coverage with Jest/Supertest, including refresh-token reuse, cross-organization access attempts, user update/delete flows, and task status authorization.
- Add an analytics endpoint for overdue task counts per user and average task completion time.
- Add real-time notifications with WebSocket or Server-Sent Events when assigned tasks change.
- Add rate limiting and request logging for stronger production hardening.
- Add a basic frontend task board consuming the documented REST API.
