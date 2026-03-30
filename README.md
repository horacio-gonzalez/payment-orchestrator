# Payment Processing Engine

> **Status:** Feature Complete
> **Test Coverage:** 97.54% (174 tests, 16 suites)

## Overview

A **Payment Orchestration Layer** built with **NestJS**. It is not a direct payment processor/gateway, but rather the engine that manages the payment lifecycle, handles asynchronous webhooks from providers (simulated Stripe/PayPal), manages user account balances with strict consistency, and maintains a complete immutable audit trail.

## Architecture & Key Decisions

The system follows an event-driven and modular architecture, implementing production-ready patterns:

*   **Hybrid Module Structure:** Domain/Infrastructure/API separation within each feature module (Payments, Webhooks, Accounts, Transactions).
*   **Data Persistence:** Hybrid approach combining **Cached Balances** (O(1) fast reads) with **Immutable Transaction Logs** (auditing and historical reconstruction).
*   **Concurrency Control:** **Pessimistic Locking** (`SELECT ... FOR UPDATE`) in PostgreSQL to guarantee balance integrity during simultaneous operations.
*   **Idempotency (Defense in Depth):** Dual-layer strategy using **Redis** (fast path, ~0.5ms) and **Database Constraints** (source of truth) to ensure every webhook is processed exactly once.
*   **Async Processing:** **BullMQ** to decouple webhook reception from processing, with exponential backoff retry logic and transaction-wrapped workers.

For detailed rationale on each decision, see [Architecture Decision Records](./src/docs/ADR.md).

## Implementation Status

### Completed
* **Project Architecture:** Hybrid domain/infrastructure/api structure across all modules
* **Database Layer:** PostgreSQL + Knex with 5 migrations
* **Docker Environment:** Multi-stage Dockerfile + docker-compose (PostgreSQL, Redis, App)
* **Payment Module:** Complete domain/infrastructure/api layers with entity validation, service logic, and repository
* **Accounts Module:** Balance management with pessimistic locking (FOR UPDATE) and transaction wrapping
* **Transactions Module:** Immutable audit log (append-only) with typed transaction records
* **Webhook Module:** Full lifecycle - controller, idempotency service, Bull queue processor
* **Redis Integration:** Caching service for idempotency fast path with graceful degradation
* **BullMQ Processing:** Async webhook processing with 3-attempt retry, exponential backoff
* **Bull Board:** Queue monitoring dashboard at `/admin/queues`
* **Concurrency Safety:** Atomic balance operations with FOR UPDATE locking, proven by concurrent tests
* **Test Suite:** 174 unit tests (97.54% coverage) + integration tests + E2E tests including concurrency validation
* **Error Handling:** Global HTTP exception filter

### Remaining (Nice-to-Have)
* CI/CD pipeline (GitHub Actions)
* API documentation (Swagger)
* Cloud deployment (Railway/Render)

## Tech Stack

*   **Framework:** NestJS (TypeScript Strict Mode)
*   **Database:** PostgreSQL (Knex query builder)
*   **Queues & Caching:** Redis, BullMQ
*   **Monitoring:** Bull Board
*   **Testing:** Jest (unit/integration), Supertest (e2e)
*   **Infrastructure:** Docker, Docker Compose

## Getting Started

### Prerequisites
*   Node.js (v20+)
*   npm
*   Docker & Docker Compose

### Installation

```bash
npm install
```

### Run Infrastructure

Start PostgreSQL and Redis containers:

```bash
docker-compose up -d
```

### Run Migrations

```bash
npm run migration:latest
```

### Run the Application

```bash
# Development (watch mode)
npm run start:dev

# Production
npm run start:prod
```

The app runs on `http://localhost:3001`. Queue dashboard available at `http://localhost:3001/admin/queues`.

## Testing

The project implements a pyramidal testing strategy with **97.54% code coverage**:

```bash
# Unit Tests (174 tests)
npm run test

# E2E / Integration Tests
npm run test:e2e

# Coverage Report
npm run test:cov
```

### Test Coverage Highlights
- **Concurrency tests:** Proves FOR UPDATE prevents race conditions with simultaneous balance updates
- **Idempotency tests:** Validates dual-layer (Redis + DB) duplicate webhook detection
- **Webhook flow tests:** End-to-end webhook reception through async processing
- **Payment lifecycle tests:** Full payment state machine validation

## Module Architecture

```
src/
├── modules/
│   ├── payments/          # Payment lifecycle management
│   │   ├── domain/        # Business logic, entities, types
│   │   ├── infrastructure/# Repository, mapper
│   │   └── api/           # Controller, DTOs
│   │
│   ├── webhooks/          # Webhook processing + idempotency
│   │   ├── domain/        # Processing logic, idempotency service
│   │   ├── infrastructure/# Repository, Bull processor
│   │   └── api/           # Webhook endpoints
│   │
│   ├── accounts/          # Balance management with locking
│   │   ├── domain/        # Balance service, business rules
│   │   ├── infrastructure/# Repository (FOR UPDATE)
│   │   └── api/           # Account endpoints
│   │
│   └── transactions/      # Immutable audit trail
│       ├── domain/        # Transaction entities, service
│       ├── infrastructure/# Repository, mapper
│       └── api/           # Transaction query endpoints
│
├── shared/
│   ├── database/          # Knex config, migrations
│   ├── redis/             # Redis service
│   └── filters/           # Global exception filter
│
└── app.module.ts
```

**Layer rules:** Domain never imports from infrastructure/api. Infrastructure can import domain. API delegates to domain.

## Database Schema

```sql
-- Cached balance (O(1) reads)
accounts: id, user_id, balance, currency, created_at, updated_at

-- Immutable audit log (append-only)
transactions: id, account_id, amount, type, reference_id, metadata, created_at

-- Payment state machine
payments: id, account_id, amount, status, provider, created_at, updated_at

-- Webhook idempotency
webhook_events: id, external_id (UNIQUE), payload, processed_at, created_at
```

## Key Patterns Demonstrated

### Webhook Processing Flow
```
Provider → Controller (~6ms response) → Bull Queue → Worker (transaction-wrapped)
                ↓                                         ↓
        Idempotency check                    Payment update + Balance update
        (Redis → DB fallback)                + Audit log (all-or-nothing)
```

### Balance Update (Pessimistic Locking)
```sql
BEGIN;
  SELECT balance FROM accounts WHERE id = X FOR UPDATE;  -- Lock row
  INSERT INTO transactions (...);                         -- Audit trail
  UPDATE accounts SET balance = balance + amount;         -- Update cache
COMMIT;                                                   -- Release lock
```

## Documentation

- [Architecture Decision Records](./src/docs/ADR.md) - Detailed rationale for persistence, idempotency, async processing, locking, and module structure
- [Project Context](./PROJECT_CONTEXT.md) - Full scope, tech stack, and learning goals
- [CLAUDE.md](./CLAUDE.md) - Development quick reference

## Author

**Horacio Gonzalez**
*Senior Backend Engineer*

Built to demonstrate technical expertise in NestJS, advanced PostgreSQL patterns (pessimistic locking, transactions), event-driven architecture, and fintech-grade data consistency.

*   **Email:** horaciojesusgg@gmail.com
