# Weekly Report Generator & Team Dashboard

A full-stack web application designed for engineering and cross-functional teams to submit, track, review, and approve weekly progress reports with an automated state machine, MongoDB version snapshots, audit trails, visual dashboard analytics, and a manager-facing AI Team-Report Assistant powered by the Google Gemini API.

---

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + React Router + Lucide Icons + Recharts
- **Backend**: Node.js + Express + TypeScript (Layered: `routes` -> `controllers` -> `services` -> `models` / `prisma`)
- **Databases (Polyglot Architecture)**:
  - **PostgreSQL 16**: Relational core for identity, RBAC, projects, report headers (workflow status), and review audit history
  - **MongoDB 7**: Document store for flexible report content, tasks, deliverables, and immutable version snapshots linked via shared UUID
  - **Redis 7**: In-memory cache for refresh tokens, sessions, and login rate-limiting
- **AI Assistant**: Provider-neutral AI Architecture defaulting to Google Gemini API using Google's official `@google/genai` SDK (`gemini-3.5-flash-lite`) operating on the free tier.
- **Containerization**: Multi-stage Dockerfiles and Docker Compose orchestrating all 5 services

---

## 🤖 Manager AI Report Assistant Architecture

The AI Assistant is a manager-only tool that answers natural-language questions about team deliverables, blockers, achievements, workload distribution, and report review statuses based strictly on real stored data from PostgreSQL and MongoDB.

### Architectural Components (`backend/src/services/ai/`)
1. **`AIProvider.ts`**: Standardized provider-neutral interface specifying `generateText(prompt, options)`.
2. **`GeminiProvider.ts`**: Concrete implementation utilizing Google's official `@google/genai` SDK. Reads configuration strictly from environment variables (`GEMINI_API_KEY`, `GEMINI_MODEL`) with no hidden fallback models.
3. **`aiProviderFactory.ts`**: Decoupled factory that resolves the active provider based on `process.env.AI_PROVIDER`. Supports provider swapping and mock injection for automated testing without burning API quota.
4. **`assistantPrompt.ts`**: Enforces strict system instructions, formats pre-calculated arithmetic metrics (hour totals, status breakdown, task counts), constructs compact markdown context, and isolates untrusted user text (`<team_reports>`) against prompt-injection attacks.
5. **`assistantService.ts`**: Orchestrates conservative server-side scope checking, timezone-aware calendar boundary resolution (`APP_TIMEZONE=Asia/Colombo`), exact and disambiguated member filtering, PostgreSQL query filtering, single-batch MongoDB `$in` content retrieval (preventing N+1 queries), backend arithmetic calculations, ISO `YYYY-MM-DD` date derivation, context limits, and rate-limit error mapping.

### Why Google Gemini for the Free Implementation
- **Free Tier Accessibility**: Google AI Studio provides an accessible free API tier without requiring credit cards.
- **Large Context Window**: Handles multi-week team status reports and task collections within free token budgets.
- **Provider Neutrality**: Implemented behind the `AIProvider` interface, allowing teams to swap to OpenAI, Anthropic, or open-source local LLMs seamlessly.

### How to Create a Gemini API Key
1. Navigate to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Sign in with your Google Account.
3. Click **"Create API key"** (select or create a Google Cloud project).
4. Copy the generated key and assign it to `GEMINI_API_KEY` in your backend `.env` file or hosting environment.

---

## 🔒 Security & Data Privacy

### What Data is Sent to the AI Provider:
- Pre-calculated arithmetic metrics (total hours, category breakdown, report counts, status distributions)
- Team Member Display Names and Email prefixes (e.g. `Evan Wright`, `evan.wright@company.com`)
- Project Names (e.g. `Core Cloud Platform`, `Data & Analytics Pipeline`)
- Reporting Week Dates in ISO `YYYY-MM-DD` format (Monday through Sunday)
- Workflow Status (e.g. `approved`, `submitted`, `needs_correction`, `draft`)
- Task Details: Task name, priority, planned/actual progress %, status, hours spent, deliverables
- Blockers & Key Issue markers
- Achievements & Key Achievement markers
- Hours logged by work type (Development, Testing, Meetings, Documentation)
- Manager feedback and review comments

### What Data is Excluded and NEVER Sent Externally:
- Passwords and password hashes (bcrypt hashes remain strictly in PostgreSQL)
- JWT access tokens, refresh secrets, and session cookies
- Database connection strings and environment secrets
- Personal data or reports outside the manager's reporting scope

### Failure & Rate-Limit Handling
If `GEMINI_API_KEY` or `GEMINI_MODEL` is missing, unconfigured, or encounters network errors:
- The system **never** outputs fake canned summaries or hardcoded executive responses.
- If rate-limited (HTTP 429 / quota exceeded), the endpoint returns HTTP **429** with code `AI_RATE_LIMITED` and message `"The AI assistant has reached its rate limit. Please wait a moment and try again."`.
- If provider is unavailable, the endpoint returns HTTP **503 Service Unavailable** with code `AI_PROVIDER_UNAVAILABLE`.
- The frontend renders an explicit error state to the manager.

> [!WARNING]
> **Free Tier Rate Limits & Quotas**: Free-tier API availability, rate limits (RPM/TPM), and daily quotas are determined by Google AI Studio and may vary over time. For production high-concurrency environments, configure a paid tier key or dedicated self-hosted open-source model.

---

## 🚀 Quickstart with Docker (All 5 Services)

### Prerequisites
- [Docker & Docker Compose](https://www.docker.com/) (or Docker Desktop) installed and running.

### 1. Build and Launch Containers
Run from the workspace root directory:

```bash
docker compose up --build
```

This brings up all 5 containers:
- **`frontend`**: Production multi-stage Nginx container serving compiled React SPA on [http://localhost:3000](http://localhost:3000)
- **`backend`**: Production Node.js API with automated Prisma schema synchronization on [http://localhost:5000](http://localhost:5000)
- **`postgres`**: PostgreSQL 16 on port `5432` with healthcheck
- **`mongodb`**: MongoDB 7 on port `27017` with healthcheck
- **`redis`**: Redis 7 on port `6379` with healthcheck

### 2. Populate Database with Seed Data
Once the containers are running, execute the database seeder:

```bash
docker compose exec backend npm run seed
```

---

## 💻 Running Locally (Development Mode)

### Step 1: Start Database Containers in Background
```bash
docker compose up -d postgres mongodb redis
```

### Step 2: Setup & Run Backend API
```bash
cd backend
npm install
cp .env.example .env
# Edit .env and supply your GEMINI_API_KEY for live queries
npx prisma db push
npm run seed        # Seeds 1 manager, 5 team members, 4 projects, 4 weeks of reports
npm run dev         # Starts backend on http://localhost:5000
```

### Step 3: Setup & Run Frontend SPA
```bash
cd frontend
npm install
npm run dev         # Starts frontend on http://localhost:3000
```

---

## 👥 Seeded Test Accounts Roster

All accounts are pre-configured with the default password: **`Password123!`**

| Role | Email Address | Description / Access |
| :--- | :--- | :--- |
| **Manager** | `manager@company.com` | Full Dashboard, Review Queue, Approvals, Project/User Management, AI Assistant |
| **Team Member** | `alice.chen@company.com` | Cloud Platform & Web Experience developer reports |
| **Team Member** | `bob.martinez@company.com` | Web Experience developer (has reports needing correction) |
| **Team Member** | `charlie.kim@company.com` | Data & Analytics Pipeline reports |
| **Team Member** | `diana.ross@company.com` | DevOps & Security Automation reports |
| **Team Member** | `evan.wright@company.com` | Cloud Platform & Analytics reports |

---

## 🧪 Running Automated Tests

Run the full end-to-end and RBAC integration test suite (Jest + Supertest):

```bash
cd backend
npm test
```

### Test Suites Included (70+ Tests):
- `rbac.test.ts`: Role-based access control and report ownership isolation
- `report-crud.test.ts`: Create, update, submit, and state machine validation
- `manager-review.test.ts`: Approve, request changes, version snapshots, and comment audit log
- `project-crud.test.ts`: Projects CRUD and team member assignments
- `dashboard-rbac.test.ts`: Summary metrics, aggregation pipelines, side-by-side view, user role updates
- `assistant.test.ts`: Comprehensive tests verifying manager RBAC, scope filtering, exact & partial member matching, member disambiguation, project filtering, batch MongoDB querying, backend arithmetic calculation, ISO date formats, 503/429 error handling, prompt isolation, natural-language query variations, and zero secret leakage (using Gemini provider mocks).

---

## ☁️ Multi-Cloud Deployment Architecture

The system is configured for seamless deployment using free-tier cloud platforms. These represent selected deployment services:

| Platform | Role | Plan | Key Characteristics & Free-Tier Quotas |
| :--- | :--- | :--- | :--- |
| **Vercel** | Frontend SPA | Hobby (Free) | Global edge CDN, automated HTTPS, same-origin API rewrite proxy. For non-commercial use. |
| **Render** | Backend Express API | Free Web Service | 512 MB RAM, spins down after 15 minutes of inactivity (cold start takes ~30–50s on initial wake-up). |
| **Neon** | Relational Database | Free Tier | Serverless PostgreSQL 16 (0.5 GiB storage). Provides pooled URL (PgBouncer) and direct URL. |
| **MongoDB Atlas** | Document Store | M0 Sandbox | 512 MB storage, shared RAM, free forever. Stores report contents and version history. |
| **Upstash** | Cache & Rate Limiter | Serverless Free | Redis (10,000 commands/day, 256 MB storage). TLS `rediss://` encrypted connections. |
| **Google AI Studio** | AI Assistant Provider | Free Tier | Free API quota for `gemini-3.5-flash-lite`. Rate-limited (RPM/TPM). |
| **GitHub** | Source Control | Private / Public | Automated CI/CD triggers on push to `main`. |

---

### Production Configuration & Environment Variables

#### Backend Web Service (Render)
Configure the following in **Render Dashboard -> Environment**:

```env
NODE_ENV=production
PORT=10000

# Neon PostgreSQL (Pooled connection for queries, Direct for migrations)
DATABASE_URL=postgresql://<user>:<password>@<neon-host>-pooler.neon.tech/<dbname>?sslmode=require
DIRECT_URL=postgresql://<user>:<password>@<neon-host>.neon.tech/<dbname>?sslmode=require

# MongoDB Atlas M0 Sandbox
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/weekly_report?retryWrites=true&w=majority

# Upstash Redis (TLS enabled)
REDIS_URL=rediss://default:<password>@<endpoint>.upstash.io:6379

# JWT Authentication Secrets (32+ character cryptographically random strings)
JWT_SECRET=<generate_via_openssl_rand_-hex_32>
JWT_REFRESH_SECRET=<generate_via_openssl_rand_-hex_32>

# Google Gemini API
AI_PROVIDER=gemini
GEMINI_API_KEY=<your_google_ai_studio_api_key>
GEMINI_MODEL=gemini-3.5-flash-lite

# Application Configuration
CLIENT_URL=https://<your-frontend>.vercel.app
APP_TIMEZONE=Asia/Colombo
COOKIE_SAMESITE=lax
```

> [!IMPORTANT]
> **Database Migrations on Production**:
> - Never execute `npx prisma db push` during application startup in production.
> - Run migrations explicitly via:
>   ```bash
>   npx prisma migrate deploy
>   ```
> - The application start command is strictly `npm start` (`node dist/index.js`).
> - To initialize the database on Neon for the first time, execute `npx prisma migrate deploy` followed by `npm run seed` from your development terminal or deployment hook.

#### MongoDB Atlas Network Access Note
Because Render Free uses dynamic outbound IP addresses, setting Network Access to `0.0.0.0/0` (Allow access from anywhere) is necessary for Atlas connectivity:
- Require a strong, unique database user password.
- Grant the database user read/write access strictly to the `weekly_report` database (do not grant cluster admin).
- Never reuse database credentials across services.

#### Frontend SPA (Vercel)
Deploy from the `frontend/` directory with Vite preset:
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- API Proxy Architecture: `frontend/vercel.json` rewrites `/api/:path*` to the Render backend URL. Requests to `/api/*` are same-origin to the browser, ensuring seamless httpOnly cookie delivery without third-party cookie restrictions.

---

## 🌐 Health Checks & API Endpoints

| Endpoint | Method | Access | Description |
| :--- | :--- | :--- | :--- |
| `/health` | `GET` | Public | Backend health check -> `{"status":"ok"}` |
| `/api/auth/login` | `POST` | Public | Rate-limited login issuing JWT + refresh cookie |
| `/api/reports` | `GET` / `POST` | Auth | Report CRUD & State Machine |
| `/api/reports/:id/review` | `POST` | Manager | Approve / Request Changes with version snapshot |
| `/api/dashboard/summary` | `GET` | Manager | Executive KPI metrics & compliance rate |
| `/api/dashboard/trends` | `GET` | Manager | Recharts time & workload aggregations |
| `/api/dashboard/side-by-side` | `GET` | Manager | Cross-team section comparison across weeks |
| `/api/dashboard/weeks` | `GET` | Manager | Distinct weeks with submitted report data |
| `/api/assistant/query` | `POST` | Manager | Grounded AI query answering team questions via Gemini |
