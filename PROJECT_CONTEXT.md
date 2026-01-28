# Payment Processing Engine - Project Context

## WHO I AM
- **Name:** Horacio González
- **Role:** Senior Backend Engineer (6 years experience)
- **Current:** Working at Kenility as a senior backend developer
- **Goal:** Build portfolio project to demonstrate expertise in topics like concurrency, queuing, transactions and scalable software architecture

## PROJECT PURPOSE
This is a **portfolio project** to demonstrate:
- Senior-level NestJS + PostgreSQL expertise
- Event-driven architecture patterns
- Production-ready thinking (testing, error handling, idempotency)
- Relevant for fintech domain (targeting companies like Fuse Finance)

**Important:** This is a **Payment Orchestration Layer**, not a payment processor. It receives webhooks from payment providers (Stripe, PayPal) and handles business logic (balances, notifications, audit trail). It does NOT connect directly to banks or card networks.

**This is NOT a tutorial follow-along. I need to learn and understand what I'm building.**

## CORE REQUIREMENTS

### What This Project Must Demonstrate:
1. **Event-Driven Architecture** - async processing, webhooks, queues
2. **PostgreSQL Advanced Usage** - transactions, row locking, complex queries
3. **Production Patterns** - idempotency, retry logic, error handling
4. **Testing** - unit, integration, e2e tests with good coverage
5. **Clean Architecture** - well-structured modules, separation of concerns

### What I'm Good At Already:
- Node.js/TypeScript (5+ years)
- AWS/GCP cloud infrastructure
- Microservices architecture
- Event-driven systems (AWS EventBridge, Firebase)
- CI/CD and DevOps

### What I'm Learning/Improving:
- NestJS specifically (have Node.js experience but not much NestJS)
- PostgreSQL advanced patterns (have used MongoDB/Firebase more)
- Testing strategies in NestJS

## PROJECT SCOPE

### Core Features:
1. **Payment Processing**
   - Create payment (pending state)
   - Process payment (success/failed states)
   - Refunds
   - Payment status tracking

2. **Webhook System**
   - Receive webhooks from simulated payment providers
   - Event-driven processing
   - Idempotency (same webhook doesn't process twice)
   - Retry logic with exponential backoff

3. **Account Balance Management**
   - User account balances
   - Transaction history
   - Balance locks during transactions (prevent race conditions)

4. **Audit Trail**
   - All state changes logged
   - Immutable event log for compliance

### Out of Scope (For Now):
- Authentication/Authorization (focus on core logic)
- Admin dashboard UI (maybe later)
- Actual payment provider integration (we'll simulate)
- Complex fraud detection

## TECH STACK

### Backend:
- **NestJS** - main framework
- **TypeScript** - strict mode
- **PostgreSQL** - main database
- **Redis** - caching + idempotency keys
- **Bull/BullMQ** - job queue for async processing

### Testing:
- **Jest** - unit + integration tests
- **Supertest** - e2e API tests
- Target: 80%+ coverage

### DevOps:
- **Docker** - docker-compose for local dev
- **Docker** - containerize the app

## KEY ARCHITECTURAL DECISIONS

These decisions are documented in detail in ARCHITECTURE_DECISIONS.md (ADR). Summary:

### Decision #1: Data Persistence Strategy
**Selected:** Hybrid approach (cached balance + immutable transactions)
- `accounts` table: Cached balance for O(1) reads
- `transactions` table: Immutable audit log (append-only)
- Updates happen in single PostgreSQL transaction
**Why:** Balance of performance (fast reads) and compliance (complete audit trail). Industry standard used by Stripe, PayPal.

### Decision #2: Idempotency Strategy  
**Selected:** Database + Redis (defense in depth)
- Redis: Fast path for duplicate detection (~0.5ms)
- Database: Source of truth with unique constraint
- If Redis fails, gracefully degrade to database-only
**Why:** 40x faster than database-only, with reliability of database as fallback.

### Decision #3: Async Processing
**Selected:** Bull queue with background workers
- Webhooks enqueued immediately, response <100ms
- Workers process with retry logic (exponential backoff)
- Transaction-wrapped processing for atomicity
**Why:** Fast response prevents provider timeouts, controlled retry logic, production-ready pattern.

### Decision #4: Balance Management & Concurrency
**Selected:** Pessimistic locking (FOR UPDATE) + transactions
- Row-level locking prevents race conditions
- All balance updates in PostgreSQL transaction
- Constraint enforcement (balance >= 0)
**Why:** Guarantees correctness under high contention, simple implementation, industry standard for financial operations.

### Decision #5: Module Structure
**Selected:** Hybrid (domain/infrastructure separation within features)
```
modules/
├── payments/
│   ├── domain/         # Business logic
│   ├── infrastructure/ # Database, external services
│   ├── api/            # Controllers, DTOs
│   └── payments.module.ts
```
**Why:** Balance between clean architecture (testability) and pragmatism (easy navigation). 80% of hexagonal benefits with 30% of complexity.

## ARCHITECTURE APPROACH

### Module Structure (Hybrid):
```
src/
├── modules/
│   ├── payments/
│   │   ├── domain/           # Payment business logic (entities, services)
│   │   ├── infrastructure/   # Database repositories, external APIs
│   │   ├── api/              # Controllers, DTOs
│   │   └── payments.module.ts
│   │
│   ├── webhooks/
│   │   ├── domain/           # Webhook processing logic
│   │   ├── infrastructure/   # Repository, idempotency, Bull workers
│   │   ├── api/              # Webhook endpoints
│   │   └── webhooks.module.ts
│   │
│   ├── accounts/
│   │   ├── domain/           # Balance logic, business rules
│   │   ├── infrastructure/   # Account repository with FOR UPDATE
│   │   ├── api/              # Account endpoints
│   │   └── accounts.module.ts
│   │
│   └── events/
│       ├── domain/           # Event emitter service
│       ├── infrastructure/   # Event store repository
│       └── events.module.ts
│
├── shared/
│   ├── database/
│   ├── redis/
│   ├── queue/
│   └── config/
│
├── common/
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   └── exceptions/
│
└── app.module.ts
```

### Layer Separation Rules:
1. **Domain:** Pure business logic, no infrastructure dependencies
2. **Infrastructure:** Database, Redis, queues, external APIs
3. **API:** HTTP concerns only, delegates to domain
4. **No cross-layer leakage:** Domain never imports from infrastructure/api

### Key Patterns to Implement:
1. **Repository Pattern** - Infrastructure layer handles data access
2. **Service Layer** - Domain layer contains business logic
3. **DTOs** - API layer for validation with class-validator
4. **Event Emitter** - Internal events for decoupling modules
5. **Queue Workers** - Infrastructure layer for async processing
6. **Transaction Management** - All balance updates wrapped in PostgreSQL transactions

## DATABASE SCHEMA (Detailed)

### Core Tables:

**1. accounts** (Cached balance for fast reads)
```sql
- id UUID PRIMARY KEY
- user_id UUID NOT NULL
- balance DECIMAL(19,4) NOT NULL DEFAULT 0 CHECK (balance >= 0)
- currency VARCHAR(3) DEFAULT 'USD'
- created_at TIMESTAMP
- updated_at TIMESTAMP
```

**2. transactions** (Immutable audit log)
```sql
- id UUID PRIMARY KEY
- account_id UUID REFERENCES accounts(id)
- amount DECIMAL(19,4) NOT NULL CHECK (amount != 0)
- type VARCHAR(50) NOT NULL  -- 'payment_received', 'refund', 'withdrawal'
- reference_id UUID          -- Links to payment_id, refund_id, etc
- metadata JSONB
- created_at TIMESTAMP
```

**3. payments** (Current payment state)
```sql
- id UUID PRIMARY KEY
- account_id UUID REFERENCES accounts(id)
- amount DECIMAL(19,4) NOT NULL
- status payment_status       -- enum: pending, processing, completed, failed
- provider VARCHAR(50)        -- 'stripe', 'paypal', etc (simulated)
- created_at TIMESTAMP
- updated_at TIMESTAMP
```

**4. payment_events** (Payment audit trail)
```sql
- id SERIAL PRIMARY KEY
- payment_id UUID REFERENCES payments(id)
- event_type VARCHAR(100)     -- 'PaymentCreated', 'PaymentCompleted', etc
- event_data JSONB
- created_at TIMESTAMP
```

**5. webhook_events** (Idempotency + webhook log)
```sql
- id UUID PRIMARY KEY
- external_id VARCHAR(255) UNIQUE NOT NULL  -- From provider
- payload JSONB NOT NULL
- processed_at TIMESTAMP
- created_at TIMESTAMP
```

### Critical Patterns:

**Balance Updates (with FOR UPDATE):**
```typescript
BEGIN TRANSACTION;
  SELECT balance FROM accounts WHERE id = X FOR UPDATE;  -- LOCK
  INSERT INTO transactions (account_id, amount, type) VALUES (...);
  UPDATE accounts SET balance = balance + amount WHERE id = X;
COMMIT;  -- UNLOCK
```

**Idempotency Check:**
```typescript
// Fast path: Redis
if (await redis.get(`webhook:${externalId}`)) return 'duplicate';

// Source of truth: Database
try {
  await db.insert(webhook_events).values({ external_id: externalId });
  await redis.setex(`webhook:${externalId}`, 86400, 'true');
} catch (UniqueViolationError) {
  return 'duplicate';
}
```

### Key Indexes:
- accounts(user_id)
- transactions(account_id, created_at)
- webhook_events(external_id) -- for unique constraint
- payments(account_id, status)

## DEVELOPMENT PHASES

### Phase 1: Setup + Payment Module (Week 1)
- Set up NestJS project with hybrid module structure
- Configure PostgreSQL + Redis + Bull
- Create Payment module (domain/infrastructure/api layers)
- Implement hybrid persistence (cached + immutable)
- Unit tests for domain layer
- Integration tests for repository
- **Deliverable:** Payments can be created and queried

### Phase 2: Webhook System + Idempotency (Week 2)
- Webhook controller and domain service
- Implement Database + Redis idempotency
- Bull queue setup and worker
- Webhook processor with transaction wrapping
- Integration tests for webhook flow
- E2E tests for idempotency
- **Deliverable:** Webhooks processed async with duplicate detection

### Phase 3: Balance Management + Concurrency (Week 3)
- Account module with domain/infrastructure separation
- Balance service with FOR UPDATE locking
- Transaction history (immutable)
- Reconciliation service (verify cached = calculated)
- Concurrency tests (prove no race conditions)
- E2E tests for complete payment → balance flow
- **Deliverable:** Safe concurrent balance updates

### Phase 4: Polish + Deploy (Week 4)
- Complete audit trail/event log
- Bull Board for queue monitoring
- Documentation (README with architecture diagram)
- Docker compose for local development
- CI/CD with GitHub Actions
- Deploy to Railway/Render
- **Deliverable:** Production-ready, deployed system

## QUALITY STANDARDS

### Code Quality:
- TypeScript strict mode
- ESLint + Prettier configured
- Meaningful variable names
- Comments for complex logic only
- No commented-out code in main branch

### Testing:
- Every service method has unit tests
- Critical flows have integration tests
- Happy path + error cases tested
- Mock external dependencies

### Git Commits:
- Meaningful commit messages
- Feature branches (not everything in main)
- Small, focused commits

## README REQUIREMENTS

The final README must include:
1. **Architecture overview** with diagram
2. **Key design decisions** explained
3. **How to run locally** (docker-compose up)
4. **API documentation** with examples
5. **Testing instructions**
6. **What I learned** section (shows growth mindset)

## QUESTIONS TO ASK WHEN STUCK

Instead of asking for full solutions, ask:
- "What pattern should I use for X?"
- "Is this approach correct for Y?"
- "How would you handle edge case Z?"
- "What am I missing in this implementation?"

## SUCCESS CRITERIA

This project is successful when:
1. ✓ A recruiter can understand what it does in 2 minutes
2. ✓ The code demonstrates senior-level thinking (architectural decisions documented)
3. ✓ Tests give confidence the code works (80%+ coverage, includes concurrency tests)
4. ✓ I can explain every architectural decision in an interview (reference ADR)
5. ✓ It's actually running somewhere (deployed with monitoring)
6. ✓ No race conditions in balance updates (proven by tests)
7. ✓ Webhooks are processed exactly once (idempotency working)
8. ✓ Clean separation of domain/infrastructure (testable business logic)

## TIMELINE
- Start: January 2026
- Target completion: February 2026 (3-4 weeks)
- Start applying to Spain: March 2026

## IMPORTANT NOTES FOR CLAUDE CODE

- **Don't give me complete code blocks unless I explicitly ask**
- Guide me to the solution with hints and questions
- Point out what's wrong but let me fix it
- Suggest resources to learn concepts I'm missing
- Challenge my decisions if they're not production-ready
- Help me understand WHY, not just WHAT

## MY LEARNING STYLE
- I prefer direct, honest feedback (no sugar-coating)
- I learn by doing, not by reading
- I want to understand the reasoning behind decisions
- Point me to documentation when relevant
- I'm comfortable being told "that's wrong, try again"

---

## ADDITIONAL DOCUMENTATION

**For detailed architectural decisions, see:** `ARCHITECTURE_DECISIONS.md` (ADR)
- Complete rationale for each decision
- Options considered and trade-offs
- Implementation patterns and examples
- Testing strategies
- Interview defense points

**For implementation plan, see:** `IMPLEMENTATION_ROADMAP.md`
- Week-by-week breakdown
- Module implementation order
- Testing checkpoints
- Deployment milestones

---

Last Updated: January 14, 2026
