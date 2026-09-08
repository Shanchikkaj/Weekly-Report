# Antigravity Build Playbook — Weekly Report Generator & Team Dashboard

How to use this file: paste the **Master Context** once at the start of your Antigravity session (or keep it pinned/referenced). Then work through **Step 1 → Step 15** in order, one prompt per message. After each step, verify the acceptance criteria before moving to the next — don't stack unverified steps. If a step's output doesn't match its criteria, paste the error back to the agent before proceeding.

---

## MASTER CONTEXT (paste this first, once)

```
We are building a full-stack web app called "Weekly Report Generator & Team Dashboard".

TECH STACK (do not deviate without asking):
- Frontend: React (Vite) + TypeScript + React Router + Tailwind CSS — pure SPA calling a REST API
- Backend: Node.js + Express + TypeScript, layered manually: routes -> controllers -> services -> models. No NestJS, no framework magic — keep it explicit and readable.
- Databases (polyglot, intentional):
  - PostgreSQL: source of truth for identity and workflow — users, roles, projects, reports (status/workflow header only), review_comments
  - MongoDB: report content — report_content (current) and report_versions (historical snapshots). Linked to Postgres via a shared UUID (Postgres generates reports.id, reused as report_id in Mongo documents). No real foreign key across DBs — this link is enforced in the service layer.
  - Redis: ephemeral only — refresh token/session storage, login rate-limit counters. Never business data.
- Containerization: Docker + docker-compose for all 5 services (frontend, backend, postgres, mongodb, redis)
- Auth: JWT access token (short-lived) + refresh token in httpOnly, secure, sameSite cookie
- Charts: Recharts on the frontend
- AI Assistant (bonus): Anthropic Claude API

ROLES: TeamMember, Manager. RBAC must be enforced server-side on every route — never trust the frontend alone.

REPORT STATUS STATE MACHINE (enforce server-side, reject illegal transitions with 4xx):
Draft -> Submitted -> Approved
Draft -> Submitted -> Needs Correction -> Submitted -> Approved (cycle can repeat)
Only the report's owner (TeamMember) can move Draft/Needs Correction -> Submitted.
Only a Manager can move Submitted -> Approved or Submitted -> Needs Correction (with a required comment).
A Manager can NEVER edit report content — only status + comment.

FIXED REPORT SCHEMA (same fields, same order, for every user — no customization):
- week_start_date, week_end_date, project_id
- tasks_completed: array of { task_name, priority (low/medium/high), planned_percent, actual_percent, status (not_started/in_progress/done/blocked), time_planned_hours, time_spent_hours, output_deliverable }
- tasks_planned_next_week: array of strings
- blockers: array of { text, is_key_issue: boolean } — exactly one can be true
- achievements: array of { text, is_key_achievement: boolean } — exactly one can be true
- hours_by_type: { development, testing, meetings, documentation } (optional numeric fields)
- notes: optional string (sanitize before render — no stored XSS)

NON-FUNCTIONAL REQUIREMENTS (apply throughout, not just at the end):
- Passwords hashed with bcrypt or argon2, never reversible encryption
- Rate limit the login endpoint using Redis
- Every list endpoint (reports, users, projects) must support pagination and filtering — never return unbounded lists
- Avoid N+1 queries — use joins/eager loading/aggregation pipelines appropriately
- No stack traces or raw DB errors ever returned to the client — use a centralized error handler
- Parameterized queries only — never string-concatenated SQL
- CORS configured narrowly (not wildcard) once we reach deployment
- Environment variables via .env, never committed; .env.example always kept up to date
- Write code you can explain line-by-line in a live coding interview — favor clarity over cleverness

When I give you a numbered step below, implement ONLY that step's scope. Do not jump ahead to later steps even if related. Confirm what you built and how to verify it before I move to the next step.
```

---

## STEP 1 — Project Scaffold (Docker + connections only, no business logic)

```
STEP 1: Scaffold only. No business logic, no models, no routes beyond a health check.

/frontend: Vite + React + TypeScript, Tailwind configured, React Router installed. One starter page. Folders: src/pages, src/components, src/api, src/context.

/backend: Express + TypeScript. Folders: src/routes, src/controllers, src/services, src/models, src/middleware, src/config. Install pg (or Prisma), mongoose, ioredis, bcrypt, jsonwebtoken, express-rate-limit, cors, dotenv.
src/config/postgres.ts, src/config/mongo.ts, src/config/redis.ts — each a standalone connection module: clear success log, clear error log, does not crash the whole process if one fails.
Entrypoint (src/index.ts) connects all three on startup, exposes GET /health -> { status: "ok" }.

docker-compose.yml: frontend, backend, postgres (postgres:16, named volume), mongodb (mongo:7, named volume), redis (redis:7, named volume). Wire backend env vars to reach each service by container name.

.env.example (backend): DATABASE_URL, MONGO_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, PORT
.gitignore: node_modules, .env, dist, build, .vite
README.md stub: Overview, Tech Stack, Setup, Running Frontend, Running Backend, Running Database (fill exact commands once verified)

After scaffolding, tell me the exact `docker-compose up` command and what output confirms success.
```

**Verify before continuing:** `docker-compose up` starts all 5 containers, backend logs 3 successful connections, `GET /health` returns 200.

---

## STEP 2 — Postgres Schema + Migrations

```
STEP 2: Postgres schema only. Use [Prisma/TypeORM — pick one and tell me why] for migrations.

Tables:
- users: id (uuid, PK), email (unique), password_hash, role (enum: team_member, manager), created_at
- projects: id (uuid, PK), name, description, active (boolean, default true)
- project_members: user_id (FK), project_id (FK) — many-to-many join table
- reports: id (uuid, PK), user_id (FK -> users), project_id (FK -> projects), week_start (date), week_end (date), status (enum: draft, submitted, needs_correction, approved, default draft), current_comment (text, nullable), created_at, updated_at
- review_comments: id (uuid, PK), report_id (FK -> reports), reviewer_id (FK -> users), mongo_version_ref (string, nullable), comment (text), action (enum: approve, request_changes), created_at

Add indexes on: reports.user_id, reports.project_id, reports.status, reports.week_start — these will be filtered/sorted on constantly.

Write a migration and run it against the dockerized Postgres. Do not write any routes, controllers, or seed data yet — schema only.

Show me the generated migration SQL so I can review it before you run it.
```

**Verify:** Migration runs clean, tables exist in Postgres (check via `docker exec` psql or a client), foreign keys and indexes are present.

---

## STEP 3 — MongoDB Schemas

```
STEP 3: Mongoose schemas only, no routes yet.

report_content collection:
- report_id (string, indexed, required) — matches a Postgres reports.id
- tasks_completed: [{ task_name, priority (enum), planned_percent, actual_percent, status (enum), time_planned_hours, time_spent_hours, output_deliverable }]
- tasks_planned_next_week: [String]
- blockers: [{ text, is_key_issue: Boolean }]
- achievements: [{ text, is_key_achievement: Boolean }]
- hours_by_type: { development, testing, meetings, documentation } (all optional Numbers)
- notes: String (optional)
- updated_at: Date

report_versions collection:
- report_id (string, indexed, required)
- version_number (Number)
- content_snapshot (same shape as report_content, embedded)
- submitted_at (Date)

Add a schema-level validator or service-level check ensuring at most one blocker has is_key_issue=true and at most one achievement has is_key_achievement=true — tell me which layer you're enforcing this at and why.

No routes yet — just the Mongoose models, connected and ready.
```

**Verify:** Insert a test document manually (via a small throwaway script or Mongo shell) and confirm it validates correctly, including the single-key-issue/achievement rule.

---

## STEP 4 — Auth: Register, Login, JWT, Sessions

```
STEP 4: Authentication only. No RBAC middleware yet — that's Step 5.

POST /api/auth/register — validates input (email format, password min length), hashes password with bcrypt, creates user in Postgres with role.
POST /api/auth/login — validates credentials, rate-limited via Redis (e.g. max 5 attempts per 15 min per IP+email combo, return 429 with a clear message when exceeded), issues a short-lived JWT access token (15 min) and a longer refresh token (7 days) stored in Redis keyed by user id, sets refresh token in an httpOnly, secure, sameSite=strict cookie.
POST /api/auth/refresh — reads the refresh cookie, validates against Redis, issues a new access token.
POST /api/auth/logout — invalidates the refresh token in Redis, clears the cookie.

Centralize error handling: validation errors return 400 with a clear message, never a stack trace. Auth failures return 401 with a generic message (don't reveal whether email or password was wrong specifically).

Show me how to test this end-to-end with curl or a REST client.
```

**Verify:** Register a user, login, confirm access token works, confirm refresh flow works, confirm rate limiting kicks in after repeated bad logins.

---

## STEP 5 — RBAC Middleware + Early RBAC Test (bonus, do this now while fresh)

```
STEP 5: Role-based access control middleware + our first automated test.

Middleware: requireAuth (validates JWT, attaches req.user), requireRole(...roles) (checks req.user.role is in the allowed list, else 403).

Apply requireAuth to all routes except /auth/* and /health.

Write an automated test (Jest + supertest, or your recommendation) that:
1. Registers two team members, A and B
2. A creates a report
3. B attempts to GET A's report by ID directly -> expect 403 or 404, never A's data
4. A manager-only route is hit by a team_member token -> expect 403

This is a required deliverable (bonus points in my assignment) — make sure it actually runs and passes, show me the exact command to run it.
```

**Verify:** Test suite runs and passes. This is your RBAC bonus requirement — don't skip it.

---

## STEP 6 — Report CRUD + Workflow State Machine

```
STEP 6: Report create/edit/submit endpoints, enforcing the state machine from the master context.

POST /api/reports — creates a Postgres reports row (status=draft) + a matching MongoDB report_content document (empty/default), same UUID linking them (generate the UUID in the service layer before either write).
PUT /api/reports/:id — updates report_content (Mongo) — only allowed if status is draft or needs_correction, and only by the report's owner. Reject otherwise with 403.
POST /api/reports/:id/submit — moves status draft|needs_correction -> submitted. Only the owner. Reject illegal transitions (e.g. submitting an already-approved report) with 409 and a clear message.
GET /api/reports/:id — returns merged Postgres header + Mongo content. Owner can see their own; Manager can see any.
GET /api/reports (list, own reports for team_member) — paginated.

Write the state machine as an explicit function/table (not scattered if-statements) so it's easy to point to and explain.

Don't implement the manager review endpoint yet — that's Step 7.
```

**Verify:** Create -> edit -> submit works. Attempting to edit a submitted report is rejected. Attempting to submit an approved report is rejected.

---

## STEP 7 — Manager Review + Version History (bonus)

```
STEP 7: Manager review actions + report version history (bonus requirement).

POST /api/reports/:id/review — Manager only. Body: { action: "approve" | "request_changes", comment: string (required if request_changes) }.
- On request_changes: BEFORE updating status, snapshot the current report_content into MongoDB report_versions (increment version_number), then set Postgres reports.status = needs_correction and current_comment = the comment. Also insert a row into Postgres review_comments (action, comment, reviewer_id, mongo_version_ref = the version_number or version doc id just created).
- On approve: set status = approved, insert a review_comments row (action=approve). No version snapshot needed on approval.

GET /api/reports/:id/versions — returns all report_versions for this report (bonus: version history list)
GET /api/reports/:id/comments — returns all review_comments for this report, ordered by created_at (bonus: full comment history, not just latest)

Confirm a manager can NEVER modify report_content directly — only these two fields (status, comment) via this endpoint.
```

**Verify:** Full cycle works: submit -> manager requests changes (snapshot created, comment stored) -> team member edits and resubmits -> manager approves. Version list and comment history both populate correctly.

---

## STEP 8 — Projects/Categories CRUD

```
STEP 8: Projects module.

GET /api/projects (paginated, all authenticated users can list)
POST /api/projects (Manager only)
PUT /api/projects/:id (Manager only)
DELETE /api/projects/:id (Manager only — soft delete via active=false, don't hard-delete if reports reference it)
POST /api/projects/:id/members — assign a team member to a project (optional feature, Manager only)
```

**Verify:** CRUD works, non-managers get 403 on write endpoints, deleting a project with existing reports doesn't break anything (soft delete).

---

## STEP 9 — Dashboard & Analytics Endpoints

```
STEP 9: Manager dashboard aggregation endpoints. Watch for N+1 queries — use a single aggregation query per endpoint, not a loop over users.

GET /api/dashboard/summary — { total_submitted_this_week, compliance_rate, needs_correction_count, open_blockers_count }
GET /api/dashboard/reports — paginated list of all reports for a selected week, with filters: member, project, date range, status
GET /api/dashboard/trends — data shaped for charts: tasks completed over time, submission/approval status by member, workload by project, time spent by task type team-wide

For trends that need report_content (Mongo) joined with reports (Postgres), fetch the Postgres rows first (with filters/pagination applied there), then batch-fetch the matching Mongo documents by report_id in one query — never fetch Mongo per-row in a loop.
```

**Verify:** Hit each endpoint with seeded data (Step 12) once available and confirm response shapes make sense for charting. Check query count/logs to confirm no N+1 pattern.

---

## STEP 10 — Frontend: Auth + Core Pages

```
STEP 10: Frontend auth flow + core report pages. Build incrementally — I'll review after this batch before more pages.

DESIGN DIRECTION (follow exactly — this is an internal team tool, not a marketing site):
- Palette: a calm, neutral base — slate/gray (#F8F9FA background, #1A1D23 primary text, #E4E7EB borders) with ONE accent color used sparingly and consistently for primary actions and active states only (pick a single blue or teal, e.g. #2563EB — do not use warm cream/terracotta, do not use near-black-with-neon-accent).
- Typography: one clean sans-serif (e.g. Inter or system-ui stack). Two weights only: regular and medium/semibold. No all-caps labels, no tracked-out eyebrow text above headings.
- Spacing: use a strict 4px-based scale (4, 8, 12, 16, 24, 32, 48) via Tailwind's default spacing scale — apply it CONSISTENTLY, same padding inside all cards/panels of the same type, same gap between form fields throughout the app. Don't mix arbitrary padding values across similar components.
- Status badges (Draft/Submitted/Needs Correction/Approved): distinct background+text color pairs per status (not just a generic gray pill for everything) — this is functional color, not decoration, so make it genuinely easy to scan a list and see status at a glance.
- Cards/panels: consistent border-radius across the whole app (pick one value, e.g. 8px, and use it everywhere — not different radii on different components), consistent border treatment (a 1px border OR a shadow, not both stacked on everything).
- Avoid: identical rounded cards with the same drop-shadow on every single element, gradient decoration, numbered step markers unless content is genuinely sequential.
- Forms: labels above inputs, consistent field height and spacing, clear inline validation messages (not just red borders with no text).

Pages: Login, Register, Personal report create/edit (one shared form component for both create and edit modes), Report history (per user, list with status badges), Report detail (read-only view).

- src/api: typed API client functions (fetch/axios) matching backend routes, with the access token attached and a refresh-on-401 interceptor.
- src/context: AuthContext holding current user + role, used for route guards.
- Protected routes: redirect to /login if not authenticated; role-based route guards for manager-only pages (used starting Step 11).
- Client-side validation mirrors backend rules (required fields, one key-issue/key-achievement max) — but note in a comment that server-side is the real enforcement.

Use Tailwind for styling, keep components small and reusable (e.g. a StatusBadge component, a TaskRow component for the tasks table). Define the palette/spacing/radius as Tailwind theme tokens in tailwind.config, not one-off inline values, so every later page automatically stays consistent.
```

**Verify:** Can register, login, create a draft report, edit it, submit it, and see it in report history with the correct status badge.

---

## STEP 11 — Frontend: Manager Pages + Dashboard Visuals

```
STEP 11: Manager-facing pages + charts.

DESIGN CONSISTENCY REMINDER: reuse the exact same Tailwind theme tokens (palette, spacing scale, border-radius, StatusBadge component) established in Step 10 — don't introduce new colors or spacing values for these pages. The dashboard summary cards should follow the same card style as the rest of the app, not a different "dashboard-specific" look. Charts should use the same accent color from the palette for primary data series, with neutral grays for secondary/comparison series — not a rainbow of unrelated chart colors.

Pages: Manager review page (open a submitted report, Approve / Request Changes with comment, view version history), Team dashboard (filterable list + summary metric cards), Team member profile page (their full report history + stats), Project management page (CRUD, list view not a modal), User management page (admin: list users, assign roles — invite/remove can be a simple email-based add for this scope).

Dashboard charts with Recharts: tasks completed trend, submission/approval status by member, workload by project, time spent by task type, recent activity feed.

Bonus: a "side-by-side" view for a selected week where the manager can pick one section (e.g. Blockers) and see it across all team members in one screen, rather than opening each report individually.
```

**Verify:** Full manager flow works end-to-end in the UI: filter dashboard, open a report, request changes, see it reflected, approve on resubmission.

---

## STEP 12 — Seed Data Script

```
STEP 12: A seed script (runnable via `npm run seed` or similar) that creates:
- 1 manager account
- 4-5 team member accounts
- 3-4 projects
- Reports spanning at least 4 past weeks per team member, with a realistic mix of statuses: some draft, some submitted, some needs_correction (with comments and at least one version history entry), some approved
- Enough variety that dashboard charts and filters are actually meaningful to look at, not empty or flat

Print login credentials for each seeded account to the console when the script finishes.
```

**Verify:** Run the seed script against a fresh DB, log in as different seeded users, confirm dashboard looks populated and realistic.

---

## STEP 13 — AI Chat Assistant (Bonus)

```
STEP 13: AI chat assistant, manager-facing only.

Backend: POST /api/assistant/query — Manager only. Accepts a natural language question (e.g. "What did the design team work on last week?"). Service layer: pull relevant reports (respecting RBAC — only the manager's visible team data, paginated/limited reasonably, e.g. last 4 weeks), format a compact context summary (not raw dumps of every field), and call the Google Gemini API (gemini-1.5-flash via @google/generative-ai) with the question + context, asking it to answer based only on the provided data.

Be explicit in code comments about what data is being sent externally — this is required documentation for my presentation.

Frontend: simple chat widget (a slide-out panel or dedicated page) with a message list and input box, only visible to managers.

Keep the first version simple — no persistent chat history storage required, just request/response per question.
```

**Verify:** Ask a few natural questions against seeded data and confirm answers are grounded in the actual seeded reports, not hallucinated.

---

## STEP 14 — Dockerize Fully + Final Local Verification

```
STEP 14: Finalize Dockerfiles for frontend (multi-stage build, served via a lightweight static server or nginx) and backend (production build). Update docker-compose.yml to use these Dockerfiles instead of dev servers, with an environment override for local dev vs a "prod-like" mode.

Confirm a completely fresh clone + `docker-compose up --build` brings up a fully working app with no manual steps beyond running the seed script once.

Update README.md with the exact, verified commands for: installing dependencies, running frontend, running backend, running the database (docker-compose), and running the seed script.
```

**Verify:** Delete your local containers/volumes, rebuild from scratch, confirm everything works following only the README.

---

## STEP 15 — Deployment (Free Tier)

```
STEP 15: Prepare for deployment — don't deploy yet, just prepare configs, then I'll do the actual platform steps manually.

- Add a production-ready CORS config (restrict to an env-configurable frontend origin, not wildcard)
- Ensure all secrets are read from environment variables with no fallback hardcoded values
- Add a simple health check route usable by Render/Vercel for uptime checks
- Document in README which env vars need to be set on Render (backend), Vercel (frontend), Neon (Postgres), MongoDB Atlas, and Upstash (Redis)

Then walk me through, step by step, connecting each of these five free-tier services once I have accounts created.
```

**Verify:** Full production smoke test on the live deployed URL — register, submit, review, approve, dashboard, AI assistant (if implemented).

---

## After Step 15

Move to the remaining workflow phases (ER diagram export, presentation slides, demo video, submission) — these are documentation/deliverable tasks, not further Antigravity prompts.
