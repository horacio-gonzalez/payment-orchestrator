# Payment Processing Engine 🚧 IN DEVELOPMENT

> **Status:** Week 1 of 4-week development cycle
> **Completion:** ~15% (Payment module structure complete)

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
* ✅ Project structure (hybrid domain/infrastructure)

* ✅ Payment module scaffolding

* ✅ Database configuration (Knex + PostgreSQL)

* ✅ Docker setup (PostgreSQL)

* ⏳ Webhook module (in progress)

* ⏳ Balance management with FOR UPDATE locking

* ⏳ BullMQ async processing

* ⏳ Redis idempotency layer

## Development Roadmap
See [IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)

## 🛠 Tech Stack

*   **Framework:** NestJS (TypeScript Strict Mode)
*   **Database:** PostgreSQL
*   **Queues & Caching:** Redis, BullMQ
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

## 👤 Author

**Horacio González**
*Senior Backend Engineer*

Built to demonstrate technical expertise in NestJS, advanced PostgreSQL patterns, and Fintech architectures.

*   **Email:** horaciojesusgg@gmail.com
