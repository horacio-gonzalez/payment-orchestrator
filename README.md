# Payment Processing Engine 🚧 IN DEVELOPMENT

> **Status:** Week 2-3 of 4-week development cycle
> **Completion:** ~60% (Core modules implemented, async processing configured)

## 🚀 Overview

This project is a **Payment Orchestration Layer** built with **NestJS**. It is not a direct payment processor/gateway, but rather the engine that manages the payment lifecycle, handles asynchronous webhooks from providers (simulated like Stripe/PayPal), manages user account balances with strict consistency, and maintains a complete immutable audit trail.

## 🏗 Architecture & Key Decisions

The system follows an event-driven and modular architecture, implementing "Production-Ready" patterns:

*   **Hybrid Architecture:** Separation of Domain/Infrastructure layers within each functional module (Payments, Webhooks, Accounts).
*   **Data Persistence:** A hybrid approach combining **Cached Balances** (for O(1) fast reads) with **Immutable Transaction Logs** (for auditing and historical reconstruction).
*   **Concurrency Control:** Implementation of **Pessimistic Locking** in PostgreSQL to guarantee balance integrity during simultaneous operations and prevent race conditions.
*   **Idempotency (Defense in Depth):** A dual-layer strategy using **Redis** (fast path) and **Database Constraints** (source of truth) to ensure every webhook is processed exactly once.
*   **Async Processing:** Uses **BullMQ** to decouple webhook reception from processing, enabling retry logic (exponential backoff) and system resilience.

## Current Implementation Status

### ✅ Completed (Core Infrastructure)
* **Project Architecture:** Hybrid domain/infrastructure/api structure in all modules
* **Database Layer:** PostgreSQL + Knex configured with migrations
* **Docker Environment:** PostgreSQL + Redis running in containers
* **Payment Module:** Complete domain/infrastructure/api layers with unit tests
* **Accounts Module:** Balance management with domain services and repository
* **Transactions Module:** Immutable audit log implementation
* **Webhook Module:** Complete with idempotency + async processing
* **Redis Integration:** Service configured for caching and idempotency keys
* **BullMQ Setup:** Async webhook processing with retry logic configured

### 🚧 In Progress
* Pessimistic locking (FOR UPDATE) in balance updates
* Transaction wrapping for atomic balance operations
* Integration tests for critical flows
* Concurrency testing (race condition validation)

### 📋 Remaining
* Complete audit trail implementation
* Queue monitoring dashboard (Bull Board)
* E2E test suite
* API documentation
* Deployment configuration

## Development Roadmap
See [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)

## 🛠 Tech Stack

*   **Framework:** NestJS (TypeScript Strict Mode)
*   **Database:** PostgreSQL (with Knex query builder)
*   **Queues & Caching:** Redis, BullMQ
*   **Testing:** Jest (unit/integration), Supertest (e2e)
*   **Local Infrastructure:** Docker, Docker Compose

## ⚡️ Getting Started

### Prerequisites
*   Node.js (v20+)
*   npm
*   Docker & Docker Compose

### Installation

1.  Install dependencies:
```bash
npm install
```
2.  Configure environment variables (ensure your `.env` file is set up).

### Run Infrastructure (Docker)

Start PostgreSQL and Redis containers:

```bash
docker-compose up -d
```

### Run Migrations

Set up the database schema:

```bash
npm run migration:latest
```

### Run the Application

```bash
# Development Mode (Watch)
npm run start:dev

# Production Mode
npm run start:prod
```

## 🧪 Testing

The project implements a pyramidal testing strategy:

```bash
# Unit Tests
npm run test

# E2E Tests (Full integration tests)
npm run test:e2e

# Coverage Report
npm run test:cov
```

## 📚 Key Features Implemented

### Webhook Processing System
- **Idempotency:** Dual-layer (Redis + Database) to prevent duplicate processing
- **Async Processing:** Bull queue with exponential backoff retry logic
- **Event Storage:** Immutable webhook event log with unique constraints

### Account & Balance Management
- **Hybrid Persistence:** Cached balances + immutable transaction log
- **Concurrency Control:** Pessimistic locking (FOR UPDATE) for safe concurrent updates
- **Audit Trail:** Complete transaction history for compliance

### Module Architecture
- **Domain Layer:** Pure business logic (no infrastructure dependencies)
- **Infrastructure Layer:** Repositories, external services, queue workers
- **API Layer:** Controllers, DTOs, validation with class-validator
- **Clean Separation:** Testable, maintainable codebase following SOLID principles

## 📖 Documentation

- `PROJECT_CONTEXT.md` - Complete project scope, architecture, and learning goals
- `src/docs/ADR.md` - Architectural Decision Records with detailed rationale
- `CLAUDE.md` - Quick reference for development patterns
- `IMPLEMENTATION_ROADMAP.md` - Week-by-week development plan

## 👤 Author

**Horacio González**
*Senior Backend Engineer*

Built to demonstrate technical expertise in NestJS, advanced PostgreSQL patterns, and Fintech architectures.

*   **Email:** horaciojesusgg@gmail.com
