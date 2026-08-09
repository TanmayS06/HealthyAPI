# 💓 HealthyAPI — API Monitoring & Incident Management Platform

[![CI / Production Quality Gate](https://github.com/TanmayS06/HealthyAPI/actions/workflows/ci.yml/badge.svg)](https://github.com/TanmayS06/HealthyAPI/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-v22%20LTS-green)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16%20App%20Router-black)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17%2F18-blue)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-red)](https://redis.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**HealthyAPI** is a production-grade synthetic API monitoring and automated incident response platform built with Next.js, PostgreSQL, Redis, BullMQ, and TypeScript. It continuously verifies endpoint availability, captures response-time telemetry, evaluates consecutive outage thresholds, automatically resolves incidents upon recovery, dispatches webhook alerts, and renders public status pages.

Designed from the ground up for software engineering rigor, distributed background processing, and software engineering internship portfolio demonstrations.

---

## 🌟 Key Features

1. **Synthetic Health Monitoring**:
   - Register HTTP/HTTPS endpoints with custom intervals (10s–300s), timeouts (500ms–15s), and expected HTTP status codes.
   - Decoupled worker process executes bounded checks with strict timeouts and response-body caps.
2. **Hardened SSRF Defense**:
   - Validates user-supplied URLs against private IPv4/IPv6 address spaces (`127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Blocks cloud metadata endpoints (`169.254.169.254`, AWS/GCP/Azure link-local).
   - Validates DNS resolution before requests and enforces security checks on redirect hops.
3. **Atomic Incident Detection Engine**:
   - State machine prevents false positives: requires consecutive failed checks (e.g. 3) to open an incident.
   - Automatically marks incidents as `RESOLVED` after consecutive successful checks (e.g. 3).
   - Concurrency-safe: PostgreSQL ACID transactions guarantee duplicate open incidents cannot be created under parallel worker executions.
4. **Interactive Telemetry Dashboard**:
   - Recharts visual latency trends, P95 tail latencies, and uptime distribution bars.
   - Time-range filters: 24 Hours, 7 Days, and 30 Days.
   - Check-based uptime calculations backed by short-lived Redis caching (TTL 30s) to prevent database hotspots.
5. **Branded Public Status Pages (`/status/[slug]`)**:
   - Publish unguessable public status pages for external stakeholders.
   - Automatically sanitizes private target URLs and internal error messages while displaying live component health and historical incident logs.
6. **Automated Alerting**:
   - Webhook alert dispatcher for `INCIDENT_OPENED` and `INCIDENT_RESOLVED` events.
   - Duplicate alert suppression and incident acknowledgement flows.

---

## 🏗️ Architecture & System Design

```
                     ┌─────────────────────────────────────────┐
                     │            User's Browser               │
                     │  (Dashboard · Charts · Incidents)       │
                     └────────────────────┬────────────────────┘
                                          │ HTTP / Session
                                          ▼
                     ┌─────────────────────────────────────────┐
                     │       Next.js 16 Web Application        │
                     │   (Server Actions · Route Handlers)     │
                     └─────────────┬───────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
                 ▼                                   ▼
    ┌─────────────────────────┐         ┌─────────────────────────┐
    │       PostgreSQL        │         │      Redis + BullMQ     │
    │  - Users & Sessions     │         │  - Scheduled Checks     │
    │  - Monitors & Config    │         │  - Notification Queues  │
    │  - Check History        │         │  - Analytics Cache      │
    │  - Incidents & Status   │         └────────────┬────────────┘
    └─────────────────────────┘                      │
                 ▲                                   │ Due jobs
                 │ ACID State Updates                ▼
    ┌────────────┴─────────────────────────────────────────────┐
    │               Dedicated Monitoring Worker                │
    │   (worker/index.ts · monitor-worker.ts · incident-engine)│
    │  - Bounded HTTP check                                    │
    │  - SSRF validation + Redirect boundary enforcement       │
    │  - Consecutive threshold state transitions               │
    └─────────────────────────────┬────────────────────────────┘
                                  │ Alert trigger
                                  ▼
                     ┌─────────────────────────┐
                     │   Notification Engine   │
                     │  (Webhooks & Email logs)│
                     └─────────────────────────┘
```

### Why Decouple the Worker from Next.js?
While Next.js handles user authentication, CRUD operations, and analytics rendering, monitoring health checks **must never depend on an active user browser session**. A dedicated background Node.js worker runs independently, pulling due jobs from BullMQ even if zero users are logged in.

---

## 🗄️ Relational Database Schema

HealthyAPI uses PostgreSQL with Prisma ORM 7:

- `User`: Accounts, hashed credentials (`bcryptjs`), alert webhook URLs.
- `Monitor`: Endpoint configuration (`url`, `method`, `intervalSeconds`, `timeoutMs`, `failureThreshold`, `recoveryThreshold`, `consecutiveFailures`, `consecutiveSuccesses`, `lastStatus`).
- `CheckResult`: Historical record for every synthetic probe (`statusCode`, `responseTimeMs`, `success`, `errorType`, `errorMessage`, `checkedAt`).
- `Incident`: Service outages (`startedAt`, `resolvedAt`, `reason`, `status: OPEN | ACKNOWLEDGED | RESOLVED`).
- `Notification`: Alert dispatch logs (`channel`, `status`, `recipient`, `message`, `sentAt`).
- `StatusPage`: Public dashboards (`title`, `slug`, `selectedMonitorIds`, `isPublished`).

---

## 🛡️ SSRF Security & Network Egress Protection

Allowing users to register arbitrary URLs creates severe security risks without defense-in-depth:
- **Private Network Scanning**: Attackers probing internal services on `10.0.0.0/8` or `192.168.0.0/16`.
- **Cloud Metadata Harvesting**: Querying `http://169.254.169.254/latest/meta-data/` to steal IAM roles.
- **DNS Rebinding & Redirect Attacks**: Redirecting from a public domain to `http://localhost:5432`.

### HealthyAPI Protections:
1. **Protocol Restrictions**: Only `http:` and `https:` are permitted.
2. **Credential Stripping**: Reject URLs embedding userinfo credentials (`user:pass@host`).
3. **DNS Validation**: Resolves all IPv4 and IPv6 addresses via `dns.lookup({ all: true })`. If any address resolves to private, loopback, link-local, carrier-grade NAT, or multicast ranges, the request is blocked before any HTTP socket opens.
4. **Manual Redirect Inspection**: Follows redirects with a max depth of 3 hops; every redirect target is independently re-validated against the SSRF engine.
5. **Bounded Response Body**: Closes stream after 64 KB to mitigate zip bombs and memory exhaustion.

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js 22 LTS or newer
- PostgreSQL (Local or Docker)
- Redis (Local or Docker)

### Option 1: Docker Compose (All-in-One)
```bash
docker compose up -d
```
Starts PostgreSQL, Redis, the Next.js web application on `http://localhost:3000`, and the background worker.

---

### Option 2: Local Development

1. **Clone the repository**:
   ```bash
   git clone https://github.com/TanmayS06/HealthyAPI.git
   cd HealthyAPI
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Ensure `.env` matches your local database and Redis ports:
   ```env
   DATABASE_URL="postgresql://healthyapi:local_dev_password@localhost:5432/healthyapi?schema=public"
   REDIS_URL="redis://127.0.0.1:6379"
   NEXTAUTH_SECRET="healthyapi_super_secret_jwt_key_2026_dev"
   ```

4. **Initialize Prisma & Apply Migrations**:
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

5. **Seed Demo Data & Telemetry**:
   ```bash
   npm run seed
   ```
   *Creates a demo user with 24 hours of simulated check telemetry and a public status page.*

6. **Start the Next.js Web App**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

7. **Start the Background Monitoring Worker** (in a second terminal):
   ```bash
   npm run worker
   ```

---

## 🔑 Demo Account Credentials

For instant testing and interview demonstrations:
- **Email**: `demo@healthyapi.dev`
- **Password**: `healthyapi2026`
- **Preconfigured Endpoints**: GitHub Zen API, Cloudflare Trace, HTTPBin Probe
- **Public Status Page**: `http://localhost:3000/status/demo-status`

---

## 🧪 Testing Suite

HealthyAPI includes unit and integration tests powered by Vitest:

```bash
# Run all automated tests
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Coverage Highlights:
- `tests/unit/ssrf.test.ts`: Validates private IPv4/IPv6 ranges, loopback, link-local, and cloud metadata blocking.
- `tests/unit/checker.test.ts`: Verifies endpoint check execution, timeout handling, and SSRF rejection.
- `tests/unit/incident-rules.test.ts`: Tests consecutive failure threshold state transitions, deduplication, and recovery.
- `tests/unit/uptime.test.ts`: Tests check-based uptime percentage formula and P95 latency percentiles.

---

## 💡 Software Engineering Interview Talking Points

When discussing HealthyAPI in engineering interviews, highlight these architectural decisions:

1. **Defense-in-Depth Outbound Request Security & DNS Rebinding Mitigation**:
   - *Problem*: Pre-flight URL validation alone is vulnerable to Time-of-Check to Time-of-Use (TOCTOU) DNS rebinding attacks where an attacker's domain resolves to a public IP during pre-flight checks, but returns `127.0.0.1` or `169.254.169.254` (cloud metadata) when the HTTP client establishes its TCP socket. Additionally, clearing request timeouts upon receiving headers leaves worker threads vulnerable to slowloris attacks and stalled response bodies that hang indefinitely.
   - *Solution*: Engineered a multi-tier outbound request pipeline using Node.js socket-level hooks:
     - Pre-flight syntactic and protocol boundary inspection (`validateTargetUrl`).
     - Custom DNS resolver (`safeLookup`) that inspects all returned A/AAAA records against private/reserved CIDR blocks and pins the TCP socket to the validated IP.
     - Socket connection hook (`socket.on("connect")`) verifying `socket.remoteAddress` before any HTTP payload is dispatched.
     - Strict overall request deadline covering DNS resolution, TCP/TLS handshake, headers, all redirect hops, and bounded body consumption (64 KB cap).
   - *Verification*: Regression suite in `tests/unit/checker-regression.test.ts` and `tests/unit/checker.test.ts` proving stalled bodies abort with `TIMEOUT` within the deadline and rebinding attempts are terminated with `SSRF_BLOCKED`.

2. **Concurrency-Safe Incident Lifecycle & Single Active Incident Constraint**:
   - *Problem*: In distributed or parallel worker setups, concurrent probe executions on the same monitor race on read-modify-write counter updates, leading to lost failure counts and duplicate incident creation. Furthermore, when an operator acknowledges an outage (`ACKNOWLEDGED`), naive engines that only query `status === "OPEN"` treat the acknowledged outage as nonexistent, spawning duplicate incidents on subsequent check failures and failing to resolve the incident upon recovery.
   - *Solution*: 
     - Defined explicit incident state semantics (`OPEN`, `ACKNOWLEDGED`, `RESOLVED`) where `ACTIVE_INCIDENT_STATES = ["OPEN", "ACKNOWLEDGED"]`.
     - Serialized concurrent checks per monitor using pessimistic row-level locking (`SELECT "id" FROM "monitors" WHERE "id" = $1 FOR UPDATE`) inside PostgreSQL interactive transactions.
     - Enforced a physical database-level partial unique index: `CREATE UNIQUE INDEX "unique_active_incident_per_monitor" ON "incidents"("monitorId") WHERE "status" IN ('OPEN', 'ACKNOWLEDGED')`.
     - Implemented deterministic transition rules (`evaluateIncidentTransition`) ensuring acknowledged outages remain active without duplicate creation, and cleanly transition to `RESOLVED` when recovery thresholds are reached.
   - *Verification*: Concurrency and state regression suites in `tests/unit/incident-regression.test.ts` and `tests/unit/incident-rules.test.ts` testing 5-way simultaneous worker races, subsequent failures under acknowledgement, and end-to-end auto-recovery.

3. **Check-Based vs. Wall-Clock Uptime**:
   - *Problem*: Naive uptime calculations assume 100% availability between check intervals.
   - *Solution*: Transparently communicated as check-based availability $\frac{\text{Passed Checks}}{\text{Total Checks}} \times 100$, paired with P95 latency percentiles to reflect degraded performance even when HTTP 200 is returned.

4. **Queue Idempotency in BullMQ**:
   - *Problem*: Re-editing a monitor interval shouldn't leave stale repeatable cron jobs running in Redis.
   - *Solution*: Idempotent scheduling via `upsertJobScheduler(schedulerId, ...)` and explicit schedule removal on deletion or pause.

5. **Multi-Tenant Ownership Verification**:
   - *Problem*: URL tampering allowing users to edit or inspect another user's monitors.
   - *Solution*: Centralized ownership assertions (`assertMonitorOwner`, `assertStatusPageOwner`) enforced in all Route Handlers and Server operations.

---

## 📄 License

MIT License. Engineered with ❤️ by TanmayS06.
