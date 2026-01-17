# Payment Orchestration Engine - Architecture Decision Record (ADR)

- **Persistencia:** State-based, Event Sourcing, o Híbrido - ¿cuál usarías y por qué?
- **Idempotency:** Database unique, Redis, o ambos - ¿qué te parece más confiable?
- **Async Processing:** ¿Vale la pena agregar Bull/queue para este proyecto?
- **Balance Safety:** ¿Cómo evitarías race conditions en balances?
- **Module Structure:** ¿Por feature, por layer, o hexagonal?

# Architecture Decision Record (ADR)

## Payment Processing Engine

**Project:** Payment Orchestration Engine (Portfolio Project)

**Author:** Horacio González

**Last Updated:** January 2026

**Status:** In Progress

---

## Table of Contents

1. [Decision #1: Data Persistence Strategy](https://claude.ai/chat/2211b387-d684-4bab-85ae-b17ddecbd05f#decision-1-data-persistence-strategy)
2. [Decision #2: Webhook Idempotency](https://claude.ai/chat/2211b387-d684-4bab-85ae-b17ddecbd05f#decision-2-webhook-idempotency)
3. [Decision #3: Async Processing](https://claude.ai/chat/2211b387-d684-4bab-85ae-b17ddecbd05f#decision-3-async-processing) *(pending)*
4. [Decision #4: Balance Management](https://claude.ai/chat/2211b387-d684-4bab-85ae-b17ddecbd05f#decision-4-balance-management) *(pending)*
5. [Decision #5: Module Structure](https://claude.ai/chat/2211b387-d684-4bab-85ae-b17ddecbd05f#decision-5-module-structure) *(pending)*

---

## Decision #1: Data Persistence Strategy

**Status:** ✅ DECIDED

**Date:** January 14, 2026

### Context

Need to decide how to model and persist payment data. Key requirements:

- Track payment state (pending → processing → completed/failed)
- Maintain complete audit trail for compliance
- Support efficient queries by status, user, date
- Enable debugging ("what happened to payment X?")

### Options Considered

### Option A: State-Based (Traditional)

Single `payments` table with mutable status field.

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  status payment_status, -- UPDATE on state change
  ...
);

```

**Pros:** Simple, fast queries, familiar pattern

**Cons:** No audit trail, lost history, hard to debug

### Option B: Event Sourcing (Pure)

Append-only event log, rebuild state from events.

```sql
CREATE TABLE payment_events (
  id SERIAL,
  event_type VARCHAR,
  event_data JSONB
);
-- Current state = replay all events

```

**Pros:** Complete audit trail, time-travel debugging, impressive

**Cons:** Complex (snapshots, projections, versioning), slower queries, over-engineering for scope

### Option C: Hybrid Approach ✅ **SELECTED**

Maintain both current state AND event history.

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  status payment_status,  -- current state for fast queries
  ...
);

CREATE TABLE payment_events (
  id SERIAL PRIMARY KEY,
  payment_id UUID REFERENCES payments(id),
  event_type VARCHAR,
  event_data JSONB,
  created_at TIMESTAMP
);

```

### Decision

**Use Hybrid Approach (Option C)**

### Rationale

1. **Audit Trail:** Every state change logged in `payment_events` (compliance requirement)
2. **Performance:** Current state in `payments` table enables O(1) queries
3. **Pragmatic:** 80% benefits of event sourcing with 20% complexity
4. **Time-boxed:** Full event sourcing would require snapshots, projections, versioning (2-3x development time)
5. **Defensible:** Shows understanding of event sourcing while demonstrating good judgment on trade-offs

### Implementation Details

```tsx
// Every state transition:
async updatePaymentStatus(id: string, newStatus: PaymentStatus) {
  return this.db.transaction(async (trx) => {
    // 1. Update current state
    await trx.update(payments)
      .set({ status: newStatus, updated_at: new Date() })
      .where({ id });

    // 2. Log event (immutable audit)
    await trx.insert(payment_events).values({
      payment_id: id,
      event_type: `Payment${newStatus}`,
      event_data: { status: newStatus, timestamp: new Date() }
    });
  });
}

```

### Consequences

- ✅ Fast queries on current state
- ✅ Complete audit trail for compliance
- ✅ Easy to debug issues
- ✅ Simpler than full event sourcing
- ⚠️ Two writes per state change (mitigated by transaction)
- ⚠️ Must keep tables in sync (enforced by transaction)

### Future Considerations

If project scales and requires:

- Time-travel debugging at scale
- Complex event replay
- Advanced analytics on historical events

Then migrate to full event sourcing with snapshots and projections.

---

## Decision #2: Webhook Idempotency

**Status:** ✅ DECIDED

**Date:** January 14, 2026

### Context

Webhooks from payment providers can arrive multiple times due to:

- Network retries
- Timeouts
- Provider's retry logic

**Critical requirement:** Process each webhook exactly once, even if received multiple times.

### Options Considered

### Option A: Database Unique Constraint Only

```sql
CREATE TABLE webhook_events (
  external_id VARCHAR UNIQUE NOT NULL
);

```

**Pros:** Simple, PostgreSQL guarantees uniqueness, no extra dependencies

**Cons:** Every duplicate check hits database (20ms), wasted DB connections

### Option B: Redis Only (with TTL)

```tsx
const exists = await redis.get(`webhook:${externalId}`);
if (exists) return 'duplicate';
await redis.setex(`webhook:${externalId}`, 86400, 'true');

```

**Pros:** Fast (0.5ms), auto-cleanup with TTL

**Cons:** If Redis fails, no idempotency guarantee

### Option C: Database + Redis (Defense in Depth) ✅ **SELECTED**

```tsx
// 1. Fast path: check Redis
const cached = await redis.get(key).catch(() => null);
if (cached) return 'duplicate';

// 2. Source of truth: database
try {
  await db.insert(webhook_events).values({ external_id });
  await redis.setex(key, 86400, 'true');
  return 'new';
} catch (UniqueViolationError) {
  await redis.setex(key, 86400, 'true'); // cache for next time
  return 'duplicate';
}

```

### Decision

**Use Database + Redis (Option C)**

### Rationale

1. **Performance:** Redis fast path (0.5ms) vs database (20ms) = 40x faster for duplicates
2. **Reliability:** Database is source of truth, Redis is optimization
3. **Graceful Degradation:** If Redis fails, fallback to database (slower but correct)
4. **Already in Stack:** Bull queue requires Redis anyway, marginal cost to use for idempotency
5. **Production Pattern:** This is how it's done in real fintech systems
6. **Demonstrates Expertise:** Shows understanding of caching, multi-tier architecture, performance optimization

### Implementation Details

```tsx
@Injectable()
export class WebhookIdempotencyService {
  async checkAndStore(externalId: string, payload: any): Promise<boolean> {
    const cacheKey = `webhook:${externalId}`;

    // Fast path: Redis check (fail open if Redis down)
    const cached = await this.redis.get(cacheKey).catch(() => null);
    if (cached) {
      this.logger.debug(`Duplicate webhook detected (Redis): ${externalId}`);
      return false;
    }

    // Slow path: Database (source of truth)
    try {
      await this.db.insert(webhook_events).values({
        external_id: externalId,
        payload,
        created_at: new Date()
      });

      // Cache for 24h
      await this.redis.setex(cacheKey, 86400, 'true');

      return true; // first time seeing this webhook

    } catch (UniqueViolationError) {
      // Race condition: another process inserted first
      this.logger.debug(`Duplicate webhook detected (DB): ${externalId}`);
      await this.redis.setex(cacheKey, 86400, 'true');
      return false;
    }
  }
}

```

### Database Schema

```sql
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id VARCHAR(255) UNIQUE NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX idx_webhook_external_id (external_id),
  INDEX idx_webhook_created_at (created_at)
);

```

### Redis Key Strategy

- **Pattern:** `webhook:{external_id}`
- **TTL:** 24 hours (86400 seconds)
- **Cleanup:** Automatic via TTL
- **Failure Mode:** Fail open (if Redis down, use database only)

### Consequences

- ✅ 20-40x faster duplicate detection
- ✅ Reduced load on PostgreSQL
- ✅ Auto-cleanup (Redis TTL)
- ✅ Reliable (database as source of truth)
- ✅ Demonstrates caching strategy knowledge
- ⚠️ Small additional complexity (3 extra lines vs database-only)
- ⚠️ Redis dependency (but already required for Bull)

### Performance Characteristics

```
Scenario: 10,000 webhooks/hour, 30% duplicates

Database-only:
- All checks: 10,000 × 20ms = 200 seconds DB time
- Duplicates: 3,000 × 20ms = 60 seconds wasted

Database + Redis:
- First checks: 7,000 × 20ms = 140 seconds DB time
- Duplicate checks: 3,000 × 0.5ms = 1.5 seconds
- Savings: ~60 seconds DB time + 3,000 connections

```

### Trade-off Rationale

**Why not database-only?**

- Leaves performance on the table
- Doesn't demonstrate Redis knowledge
- More DB load under high duplicate rate

**Why not Redis-only?**

- No durability guarantee
- If Redis fails/restarts, lose idempotency
- Too risky for financial system

### Interview Defense

If asked "Why not just database?" answer:

> "Database unique constraint guarantees correctness, but for 50K+ webhooks/day with high duplicate rates, hitting the database for every check becomes a bottleneck. Redis provides a fast path (40x faster) while the database remains the source of truth. If Redis fails, we gracefully degrade to database-only. This is a standard pattern in high-throughput financial systems."
> 

---

## Decision #3: Async Processing

**Status:** ✅ DECIDED

**Date:** January 14, 2026

### Context

When a webhook arrives from a payment provider, we need to:

1. Validate payload
2. Check idempotency
3. Update payment status
4. Update user balance
5. Log audit trail
6. Send notifications (email/push)
7. Respond to the provider

**Key question:** Do we process everything synchronously within the HTTP request, or enqueue for async processing?

### Critical Requirements

- Payment providers (Stripe, PayPal, etc.) have timeout limits (typically 5-10 seconds)
- If no response is received, providers automatically retry
- Must respond quickly to avoid unnecessary retries
- Must handle processing failures gracefully with retry logic
- Cannot lose data if processing fails mid-way

### Options Considered

### Option A: Synchronous Processing

Process everything within the HTTP request before responding.

```tsx
@Post('/webhooks/payment-providers')
async handleWebhook(@Body() payload) {
  // Validate
  this.validate(payload);

  // Check idempotency
  const isNew = await this.idempotency.check(payload.external_id);
  if (!isNew) return { status: 'duplicate' };

  // Process everything synchronously
  await this.payments.updateStatus(payload.payment_id, 'completed');
  await this.accounts.increaseBalance(payload.user_id, payload.amount);
  await this.notifications.sendEmail(payload.user_id, 'Payment received');
  await this.audit.log('payment_completed', payload);

  return { status: 'processed' };
}

```

**Pros:**

- Simple and straightforward
- Immediate consistency (no eventual consistency concerns)
- Easy to debug (single stack trace)
- No additional dependencies

**Cons:**

- Slow response time (can exceed 1-2 seconds if email sending is slow)
- Risk of timeout if any operation is slow (database, email service)
- If request fails mid-way, provider retries entire flow
- Cannot control retry logic (provider decides)
- One slow webhook blocks other webhooks
- No backpressure management under high load

**Performance:**

```
Typical latencies:
- Validation: 2ms
- Idempotency check: 2ms
- Payment update: 20ms
- Balance update: 30ms
- Email sending: 500-2000ms
- Audit log: 10ms
Total: ~600-2100ms per webhook

```

### Option B: Async Processing with Bull Queue ✅ **SELECTED**

Quickly validate and enqueue, then process in background worker.

```tsx
// Controller: Fast acknowledgment
@Post('/webhooks/payment-providers')
async handleWebhook(@Body() payload) {
  // Quick validation
  this.validateBasic(payload);

  // Check idempotency
  const isNew = await this.idempotency.check(payload.external_id);
  if (!isNew) return { status: 'duplicate' };

  // Enqueue for processing
  await this.webhookQueue.add('process-payment-webhook', payload, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  });

  // Fast response (<100ms)
  return { status: 'accepted' };
}

// Worker: Heavy processing
@Processor('webhook-processing')
export class WebhookProcessor {
  @Process('process-payment-webhook')
  async processWebhook(job: Job) {
    const { payment_id, user_id, amount } = job.data;

    // Critical operations in transaction
    await this.db.transaction(async (trx) => {
      await trx.payments.updateStatus(payment_id, 'completed');
      await trx.accounts.increaseBalance(user_id, amount);
      await trx.audit.log('payment_completed', { payment_id, amount });
    });

    // Non-critical operations outside transaction
    try {
      await this.notifications.sendEmail(user_id, 'Payment received');
    } catch (err) {
      // Log but don't fail the job
      this.logger.error(`Email failed for payment ${payment_id}`, err);
    }
  }
}

```

**Pros:**

- Fast response to provider (<100ms)
- Controlled retry logic (exponential backoff: 2s, 4s, 8s)
- Automatic retry on failure (configurable attempts)
- Backpressure management (queue absorbs load spikes)
- Built-in monitoring (Bull Board UI)
- No blocking between webhooks
- Production-ready pattern used by Stripe, PayPal, etc.

**Cons:**

- Additional complexity (workers, queue management)
- Eventual consistency (800ms-1s delay between webhook and processing)
- More difficult to debug (async traces)
- Requires Redis (but already needed for idempotency)

**Performance:**

```
Controller response:
- Validation: 2ms
- Idempotency check: 2ms
- Queue.add(): 2ms
Total: ~6ms (250x faster than sync)

Worker processing:
- Happens asynchronously (typically 100-800ms later)
- Does not block webhook response

```

### Option C: Hybrid (Critical Sync, Non-Critical Async)

Process critical operations synchronously, enqueue non-critical.

```tsx
@Post('/webhooks/payment-providers')
async handleWebhook(@Body() payload) {
  const isNew = await this.idempotency.check(payload.external_id);
  if (!isNew) return { status: 'duplicate' };

  // Critical: do synchronously
  await this.db.transaction(async (trx) => {
    await trx.payments.updateStatus(...);
    await trx.accounts.increaseBalance(...);
    await trx.audit.log(...);
  });

  // Non-critical: fire and forget
  this.notificationQueue.add('send-email', { user_id, type: 'payment_received' });

  return { status: 'processed' };
}

```

**Pros:**

- Balance between immediate and eventual consistency
- Critical operations are immediate
- Non-critical operations don't block response

**Cons:**

- More complex conceptually (two code paths)
- Requires deciding what is "critical" vs "non-critical" (subjective)
- More test scenarios (sync path + async path)
- Still slower than pure async (~500ms response)

### Decision

**Use Async Processing with Bull Queue (Option B)**

### Rationale

1. **Industry Standard Pattern:** This is exactly how fintech companies (Stripe, PayPal, Adyen) process webhooks in production. Not over-engineering, it's the correct pattern.
2. **Redis Already in Stack:** Bull requires Redis, which we already need for idempotency. Marginal cost is minimal (~2 hours setup vs significant benefits).
3. **Demonstrates Senior-Level Thinking:**
    - Understanding of distributed systems
    - Knowledge of job queues and background processing
    - Resilience patterns (retry, backoff, dead letter queue)
    - Production-ready approach
4. **Performance Under Load:** Can handle high webhook volume without blocking. Queue provides natural backpressure.
5. **Simpler than Hybrid:** Pure async is conceptually cleaner than deciding what's sync vs async. Everything goes through the queue.
6. **Better Error Handling:** Controlled retry with exponential backoff. Failed jobs go to dead letter queue for manual intervention.
7. **Eventual Consistency Acceptable:** 800ms delay between webhook arrival and balance update is imperceptible to users (payment provider shows success immediately to user anyway).

### Implementation Details

### Bull Configuration

```tsx
// webhook.module.ts
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'webhook-processing',
      defaultJobOptions: {
        attempts: 3,              // Retry up to 3 times
        backoff: {
          type: 'exponential',    // 2s, 4s, 8s delays
          delay: 2000
        },
        removeOnComplete: 100,    // Keep last 100 completed jobs
        removeOnFail: 500         // Keep last 500 failed jobs (debugging)
      }
    })
  ]
})
export class WebhookModule {}

```

### Critical Pattern: Transaction in Worker

**❌ WRONG - Without Transaction:**

```tsx
@Process('process-payment-webhook')
async processWebhook(job: Job) {
  await this.payments.updateStatus(...);     // ✓ Succeeds
  await this.accounts.increaseBalance(...);  // ✓ Succeeds
  // CRASH HERE (network timeout, DB connection lost, etc)
  await this.audit.log(...);                 // ✗ Never executes

  // Result: Inconsistent state
  // - Payment marked as completed
  // - Balance updated
  // - But NO audit log
}

```

**✅ CORRECT - With Transaction:**

```tsx
@Process('process-payment-webhook')
async processWebhook(job: Job) {
  const { payment_id, user_id, amount } = job.data;

  // ALL critical operations in transaction
  await this.db.transaction(async (trx) => {
    await trx.payments.updateStatus(payment_id, 'completed');
    await trx.accounts.increaseBalance(user_id, amount);
    await trx.audit.log('payment_completed', { payment_id, amount });

    // If ANY operation fails → automatic rollback
    // Either ALL succeed, or NONE succeed (atomic)
  });

  // Non-critical operations OUTSIDE transaction
  try {
    await this.notifications.sendEmail(user_id, 'Payment received');
  } catch (err) {
    // Log error but DON'T fail the job
    // We don't want to rollback payment because email failed
    this.logger.error(`Email notification failed for ${payment_id}`, err);
  }
}

```

**Why This Matters:**

- In fintech, data consistency is CRITICAL
- Cannot have payment completed but balance not updated
- Transaction ensures atomic operations: all-or-nothing
- Non-critical operations (emails) should not cause rollback

### Monitoring with Bull Board

```tsx
// app.module.ts
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';

@Module({
  imports: [
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter
    })
  ]
})

```

**Access at:** `http://localhost:3000/admin/queues`

**Provides:**

- Real-time job status (active, completed, failed)
- Retry history for each job
- Performance metrics (processing time, throughput)
- Manual job retry/deletion
- Dead letter queue inspection

### Consequences

**Positive:**

- ✅ Fast webhook response (<100ms) prevents provider timeouts
- ✅ Controlled retry logic with exponential backoff
- ✅ Automatic failure handling (dead letter queue)
- ✅ Backpressure management under high load
- ✅ Built-in monitoring via Bull Board
- ✅ Demonstrates production-ready patterns
- ✅ Transaction safety prevents data inconsistency

**Negative:**

- ⚠️ Eventual consistency (800ms delay typical)
- ⚠️ Additional complexity (workers, queue management)
- ⚠️ Requires Redis (but already needed for idempotency)
- ⚠️ Async debugging is harder (no single stack trace)

**Neutral:**

- Bull setup adds ~2 hours to development time
- Requires proper transaction usage (easy to get wrong)
- Need to monitor queue health in production

### Performance Characteristics

```
Webhook Processing Flow:

1. Controller Phase (synchronous):
   - Validation: 2ms
   - Idempotency check (Redis): 2ms
   - Queue.add(): 2ms
   Total: ~6ms → Return 200 OK

2. Worker Phase (asynchronous, ~100-800ms later):
   - Transaction begin: 2ms
   - Payment update: 20ms
   - Balance update: 30ms
   - Audit log: 10ms
   - Transaction commit: 15ms
   Total critical path: ~77ms

3. Non-critical Phase:
   - Email sending: 500-2000ms (doesn't block)

Result: Provider sees response in 6ms vs 600-2100ms (100-350x faster)

```

### Failure Handling Example

```
Timeline with failure and retry:

10:00:00.000 - Webhook arrives
10:00:00.006 - Response sent (200 OK)
10:00:00.100 - Worker picks up job
10:00:00.150 - Database connection timeout (FAILURE)

Bull automatic retry #1:
10:00:02.150 - Retry attempt 1 (2s delay)
10:00:02.200 - Still failing (database overloaded)

Bull automatic retry #2:
10:00:06.200 - Retry attempt 2 (4s delay)
10:00:06.280 - Success! Payment processed

Result: Payment eventually processed despite transient failures
No duplicate webhooks from provider (responded fast initially)

```

### Interview Defense

**If asked: "Why async instead of sync?"**

> "Payment providers like Stripe have 5-10 second timeout limits. Processing webhooks synchronously risks timeouts, especially if external services (email, SMS) are involved. By responding within 100ms and processing asynchronously, we prevent unnecessary retries from the provider.
> 
> 
> Bull gives us controlled retry logic with exponential backoff, automatic dead letter queue for persistent failures, and built-in monitoring. This is the industry standard pattern used by Stripe, PayPal, and other fintech companies.
> 
> The eventual consistency (typically 800ms) is acceptable because users don't see our internal balance update - they see the payment success from Stripe's UI immediately."
> 

**If asked: "What about eventual consistency?"**

> "There's an 800ms gap between webhook arrival and balance update. This is imperceptible to users since the payment provider (Stripe) shows success immediately in their UI. Our system catches up within a second. If we needed strict immediate consistency, I would have used a hybrid approach with critical operations synchronous, but the trade-off wasn't worth the slower response time."
> 

**If asked: "How do you prevent data inconsistency?"**

> "All critical operations (payment status, balance update, audit log) happen within a PostgreSQL transaction in the worker. Either all operations succeed, or all rollback. Non-critical operations like email sending happen outside the transaction so they don't cause rollback if they fail."
> 

### Testing Strategy

1. **Unit Tests:** Mock queue, test controller logic
2. **Integration Tests:** Real queue, test worker processing
3. **E2E Tests:** Webhook → Queue → Worker → Database
4. **Failure Tests:** Simulate DB timeouts, verify retry logic
5. **Idempotency Tests:** Send duplicate jobs, verify single processing

### Future Considerations

If volume grows significantly:

- Add queue priority (urgent vs normal webhooks)
- Horizontal scaling (multiple worker instances)
- Queue sharding for better throughput
- Metrics/alerts on queue depth and processing time

---

---

## Decision #4: Balance Management & Concurrency Control

**Status:** ✅ DECIDED

**Date:** January 14, 2026

### Context

Need to manage user account balances safely with:

- Concurrent balance updates (multiple payments arriving simultaneously)
- Race condition prevention (lost updates)
- Audit trail (complete transaction history)
- Performance (fast balance queries)
- Data integrity (balance never negative, no lost money)

**Critical requirement:** In fintech, balance inconsistencies are catastrophic. A race condition that loses $1 on one transaction becomes millions lost at scale.

### The Core Problem: Race Conditions

```
Scenario: User has $100 balance, receives two $50 payments simultaneously

Without protection:
10:00:00.000 - Request A reads balance: $100
10:00:00.001 - Request B reads balance: $100
10:00:00.010 - Request A writes: $100 + $50 = $150
10:00:00.011 - Request B writes: $100 + $50 = $150 (OVERWRITES A)

Final balance: $150 ❌
Correct balance: $200 ($100 + $50 + $50)
Lost: $50

```

This is called a "lost update" and must be prevented.

### Options Considered

### Option A: Simple Cached Balance Only

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  balance DECIMAL NOT NULL,
  updated_at TIMESTAMP
);

-- Update:
UPDATE accounts SET balance = balance + 100 WHERE id = X;

```

**Pros:**

- Simple implementation
- Fast reads (O(1))

**Cons:**

- ❌ No audit trail (can't explain how balance changed)
- ❌ Race conditions without locking
- ❌ If bug occurs, no way to recover history
- ❌ Not acceptable for financial systems

### Option B: Immutable Transactions Only

```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  account_id UUID,
  amount DECIMAL,
  type VARCHAR,
  created_at TIMESTAMP
);

-- Balance = SUM(transactions)
SELECT SUM(amount) FROM transactions WHERE account_id = X;

```

**Pros:**

- Perfect audit trail (immutable, append-only)
- No race conditions on writes (INSERT only)
- Easy debugging (replay all transactions)

**Cons:**

- ⚠️ Slow reads: O(n) where n = number of transactions
- ⚠️ Performance degrades as transactions grow
- ⚠️ Millions of transactions = very slow balance queries

### Option C: Cached Balance + Immutable Transactions (Stripe Pattern) ✅ **SELECTED**

```sql
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  balance DECIMAL NOT NULL CHECK (balance >= 0),
  updated_at TIMESTAMP
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  amount DECIMAL NOT NULL CHECK (amount != 0),
  type VARCHAR NOT NULL,
  reference_id UUID,
  metadata JSONB,
  created_at TIMESTAMP
);

-- Update (with pessimistic locking):
BEGIN;
  SELECT balance FROM accounts WHERE id = X FOR UPDATE; -- LOCK
  INSERT INTO transactions (account_id, amount, type) VALUES (X, 100, 'deposit');
  UPDATE accounts SET balance = balance + 100 WHERE id = X;
COMMIT;

```

**Pros:**

- Fast reads: O(1) from cached balance
- Complete audit trail: immutable transactions table
- Safe concurrent updates: FOR UPDATE prevents race conditions
- Industry standard: Used by Stripe, PayPal, Square

**Cons:**

- Two tables to keep in sync (mitigated by transaction)
- Slightly more complex than Option A

### Option D: Double-Entry Ledger (Banking Standard)

```sql
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY,
  account_id UUID,
  debit DECIMAL,
  credit DECIMAL,
  created_at TIMESTAMP
);

-- Every transaction creates TWO entries
-- Balance = SUM(credits) - SUM(debits)

```

**Pros:**

- Self-balancing (total debits = total credits)
- Accounting standard (500+ years old)
- Bug detection built-in

**Cons:**

- ⚠️ Conceptually more complex for non-accountants
- ⚠️ Slow reads without caching
- ⚠️ Overkill for this project scope

### Decision

**Use Cached Balance + Immutable Transactions with Pessimistic Locking (Option C)**

### Rationale

1. **Industry Standard:** This is the exact pattern used by Stripe, PayPal, Square, and modern fintech companies. Not over-engineering, it's production-proven.
2. **Performance + Audit:** Combines fast O(1) balance reads with complete immutable audit trail.
3. **Safety:** Pessimistic locking (FOR UPDATE) guarantees no race conditions. PostgreSQL ensures correctness.
4. **Pragmatic:** More robust than Option A, more performant than Option B, simpler than Option D.
5. **Reconcilable:** Can verify cached balance matches SUM(transactions) to detect bugs.
6. **Feasible:** Can be implemented in ~5 hours vs 10+ hours for double-entry ledger.

### Locking Strategy: Pessimistic (FOR UPDATE)

**Why Pessimistic over Optimistic?**

**Pessimistic Locking:**

```sql
BEGIN;
SELECT * FROM accounts WHERE id = X FOR UPDATE; -- LOCK the row
-- Other transactions WAIT until this commits
UPDATE accounts SET balance = balance + 100 WHERE id = X;
COMMIT; -- UNLOCK

```

- Simple: No retry logic needed
- Guaranteed: Database ensures no conflicts
- Fast operations: Balance updates take <20ms, blocking is acceptable
- Industry standard: All fintech uses this for money operations

**Optimistic Locking (rejected):**

```sql
-- Add version column, retry on conflict
UPDATE accounts SET balance = ?, version = version + 1
WHERE id = ? AND version = ?;
-- If 0 rows updated → retry entire operation

```

- Complex: Requires retry logic with exponential backoff
- Under high contention: Many wasted retries
- Not ideal for: Operations that will frequently conflict (same account)

**Decision:** Pessimistic locking is correct for balance updates because:

- Balances have HIGH contention (many updates to same account)
- Operations are FAST (<20ms), so blocking is acceptable
- Simplicity matters (no retry logic)
- Industry standard (Stripe, banks all use pessimistic for money)

### Database Schema

```sql
-- Accounts table: Cached balance for fast reads
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  balance DECIMAL(19, 4) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT positive_balance CHECK (balance >= 0)
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);

-- Transactions table: Immutable audit log
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  amount DECIMAL(19, 4) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'payment_received', 'refund', 'withdrawal'
  reference_id UUID, -- Links to payment, refund, etc
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  CHECK (amount != 0) -- No zero-amount transactions
);

CREATE INDEX idx_transactions_account_id ON transactions(account_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_reference_id ON transactions(reference_id);

```

**Key Design Decisions:**

- `DECIMAL(19, 4)`: Supports up to 999 trillion with 4 decimal places (handles cents/centavos)
- `CHECK (balance >= 0)`: Database enforces no negative balances
- `CHECK (amount != 0)`: Prevents noise in transaction log
- Indexes on frequently queried columns
- `metadata JSONB`: Flexible for additional context

### Implementation Pattern

```tsx
@Injectable()
export class BalanceService {
  async updateBalance(
    accountId: string,
    amount: number,
    type: string,
    referenceId?: string,
    metadata?: any
  ): Promise<void> {

    if (amount === 0) {
      throw new BadRequestException('Amount cannot be zero');
    }

    await this.db.transaction(async (trx) => {
      // 1. PESSIMISTIC LOCK: Acquire row lock
      const account = await trx('accounts')
        .select('id', 'balance')
        .where({ id: accountId })
        .forUpdate() // ← CRITICAL: Locks row until commit
        .first();

      if (!account) {
        throw new NotFoundException(`Account ${accountId} not found`);
      }

      // 2. Calculate new balance
      const newBalance = parseFloat(account.balance) + amount;

      // 3. Constraint check
      if (newBalance < 0) {
        throw new InsufficientFundsException(
          `Insufficient funds. Balance: ${account.balance}, Requested: ${amount}`
        );
      }

      // 4. Update cached balance
      await trx('accounts')
        .update({
          balance: newBalance,
          updated_at: new Date()
        })
        .where({ id: accountId });

      // 5. Insert immutable transaction record (audit trail)
      await trx('transactions').insert({
        account_id: accountId,
        amount: amount,
        type: type,
        reference_id: referenceId,
        metadata: metadata
      });

      // Transaction commits → lock released
    });
  }

  async getBalance(accountId: string): Promise<number> {
    // Fast O(1) read from cached balance
    const account = await this.db('accounts')
      .select('balance')
      .where({ id: accountId })
      .first();

    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    return parseFloat(account.balance);
  }

  async getTransactionHistory(accountId: string, limit = 50, offset = 0) {
    return this.db('transactions')
      .select('*')
      .where({ account_id: accountId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);
  }
}

```

**Critical Implementation Details:**

1. **Everything in ONE transaction:**
    - Lock account row
    - Update cached balance
    - Insert transaction record
    - If ANY step fails → automatic rollback
2. **FOR UPDATE positioning:**
    - Must be FIRST operation in transaction
    - Locks row immediately, others wait
3. **Constraint enforcement:**
    - Code checks `newBalance < 0`
    - Database also enforces via `CHECK (balance >= 0)`
    - Defense in depth

### Reconciliation Strategy

Periodically verify cached balance matches sum of transactions:

```tsx
async reconcileBalance(accountId: string): Promise<{
  cached: number;
  calculated: number;
  discrepancy: number;
}> {
  const account = await this.db('accounts')
    .select('balance')
    .where({ id: accountId })
    .first();

  const result = await this.db('transactions')
    .sum('amount as total')
    .where({ account_id: accountId })
    .first();

  const cached = parseFloat(account.balance);
  const calculated = parseFloat(result.total || 0);
  const discrepancy = Math.abs(cached - calculated);

  if (discrepancy > 0.01) { // More than 1 cent difference
    this.logger.error(`Balance discrepancy for account ${accountId}:
      Cached: ${cached}, Calculated: ${calculated}`);
    // Alert/notify for investigation
  }

  return { cached, calculated, discrepancy };
}

// Run nightly via cron
@Cron('0 2 * * *') // 2 AM daily
async reconcileAllAccounts() {
  const accounts = await this.db('accounts').select('id');

  for (const account of accounts) {
    await this.reconcileBalance(account.id);
  }
}

```

**Why This Matters:**

- Detects bugs before they become disasters
- Validates data integrity
- Required for financial compliance
- Shows production-ready thinking

### Testing Strategy

### Unit Tests

```tsx
describe('BalanceService', () => {
  it('should update balance successfully', async () => {
    const account = await createTestAccount(100);
    await balanceService.updateBalance(account.id, 50, 'deposit');

    const balance = await balanceService.getBalance(account.id);
    expect(balance).toBe(150);
  });

  it('should reject negative balance', async () => {
    const account = await createTestAccount(50);

    await expect(
      balanceService.updateBalance(account.id, -100, 'withdrawal')
    ).rejects.toThrow(InsufficientFundsException);
  });

  it('should create transaction record', async () => {
    const account = await createTestAccount(100);
    await balanceService.updateBalance(account.id, 50, 'deposit', 'ref_123');

    const txs = await balanceService.getTransactionHistory(account.id);
    expect(txs).toHaveLength(1);
    expect(txs[0].amount).toBe(50);
    expect(txs[0].reference_id).toBe('ref_123');
  });
});

```

### Concurrency Tests (CRITICAL)

```tsx
describe('BalanceService - Concurrency', () => {
  it('should handle concurrent deposits correctly', async () => {
    const account = await createTestAccount(0);

    // 10 concurrent deposits of $10 each
    const promises = Array(10).fill(null).map(() =>
      balanceService.updateBalance(account.id, 10, 'deposit')
    );

    await Promise.all(promises);

    const finalBalance = await balanceService.getBalance(account.id);
    expect(finalBalance).toBe(100); // $0 + (10 × $10) = $100

    const txs = await balanceService.getTransactionHistory(account.id);
    expect(txs).toHaveLength(10); // All 10 recorded
  });

  it('should prevent race conditions with FOR UPDATE', async () => {
    const account = await createTestAccount(100);

    // Two simultaneous withdrawals that would exceed balance
    const promises = [
      balanceService.updateBalance(account.id, -60, 'withdrawal'),
      balanceService.updateBalance(account.id, -60, 'withdrawal')
    ];

    const results = await Promise.allSettled(promises);

    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    // One succeeds, one fails (insufficient funds)
    expect(successes).toBe(1);
    expect(failures).toBe(1);

    const finalBalance = await balanceService.getBalance(account.id);
    expect(finalBalance).toBe(40); // $100 - $60 = $40 (not negative)
  });
});

```

**This test PROVES that FOR UPDATE prevents race conditions.**

### Consequences

**Positive:**

- ✅ Fast balance queries (O(1) from cached value)
- ✅ Complete audit trail (immutable transaction log)
- ✅ No race conditions (FOR UPDATE guarantees)
- ✅ Atomic operations (transaction ensures consistency)
- ✅ Database-enforced constraints (negative balance impossible)
- ✅ Reconcilable (can verify cached = calculated)
- ✅ Industry standard pattern (same as Stripe, PayPal)

**Negative:**

- ⚠️ Two tables to maintain (but worth the trade-off)
- ⚠️ Blocking under high contention (acceptable for <20ms operations)
- ⚠️ Potential for deadlocks (mitigated by consistent lock ordering)

**Neutral:**

- Implementation adds ~5 hours to development time
- Requires proper transaction usage (easy to get wrong if not careful)
- Need monitoring for reconciliation discrepancies

### Performance Characteristics

```
Balance Read (getBalance):
- Query: SELECT balance FROM accounts WHERE id = X
- Time: ~2-5ms (indexed lookup)
- Complexity: O(1)

Balance Update (updateBalance):
- Lock acquisition: ~2ms
- Balance update: ~5ms
- Transaction insert: ~5ms
- Transaction commit: ~8ms
Total: ~20ms

Under concurrent load:
- 100 concurrent updates to SAME account: ~2 seconds total (serial)
- 100 concurrent updates to DIFFERENT accounts: ~20ms (parallel)

```

### Edge Cases Handled

1. **Concurrent deposits:** FOR UPDATE serializes, all succeed
2. **Concurrent withdrawals exceeding balance:** One succeeds, others fail with InsufficientFunds
3. **Transaction rollback:** If any step fails, entire update rolls back (no partial state)
4. **Zero-amount transactions:** Rejected by constraint
5. **Negative final balance:** Rejected by constraint + code check
6. **Missing account:** Throws NotFoundException before attempting update

### Interview Defense

**If asked: "Why cached balance instead of calculating from transactions?"**

> "For performance. Calculating balance as SUM(transactions) is O(n) and becomes slow with millions of transactions. The cached balance gives O(1) reads while the immutable transactions table provides complete audit trail. We reconcile nightly to detect any discrepancies. This is the same pattern Stripe uses."
> 

**If asked: "Why pessimistic locking instead of optimistic?"**

> "Balance updates have high contention - the same account receives multiple payments. Optimistic locking would result in many failed attempts and retries under contention. Since our balance updates are fast (<20ms), pessimistic locking's blocking behavior is acceptable. It's also simpler - no retry logic needed. This is the industry standard for financial operations."
> 

**If asked: "What if someone bypasses your service and updates the database directly?"**

> "The database has a CHECK constraint preventing negative balances, so direct SQL updates would be rejected if they violate constraints. However, bypassing the service would skip the transaction log, breaking our audit trail. This is why database access should be restricted and all balance changes must go through the service layer."
> 

**If asked: "How do you prevent deadlocks?"**

> "Deadlocks occur when transactions lock resources in different orders. We mitigate this by: (1) Keeping transactions short (<20ms), (2) Always locking in consistent order if multiple accounts involved, (3) Using lock timeouts. PostgreSQL also detects deadlocks automatically and kills one transaction, which Bull will retry."
> 

### Future Considerations

If system scales significantly:

- **Sharding:** Partition accounts across multiple databases
- **Read replicas:** Offload balance reads to replicas (with slight staleness acceptable)
- **Optimistic locking for reads:** If contention becomes problematic, switch to optimistic for low-priority operations
- **Event sourcing:** If need for time-travel debugging grows, migrate to full event sourcing

For now, this implementation handles:

- Thousands of accounts
- Hundreds of concurrent transactions per second
- Millions of transaction records

### References

- Stripe Balance API: https://stripe.com/docs/api/balance
- PostgreSQL Row Locking: https://www.postgresql.org/docs/current/explicit-locking.html
- Martin Kleppmann: "Designing Data-Intensive Applications" (Chapter on Transactions)

---

## Decision #5: Module Structure & Organization

**Status:** ✅ DECIDED

**Date:** January 14, 2026

### Context

Need to decide how to organize code into modules and folders. This affects:

- Developer experience (how easy to navigate codebase)
- Testability (how easy to test business logic in isolation)
- Maintainability (how easy to add features without breaking existing code)
- Scalability (how well structure holds as project grows)

**Key consideration:** This is a 3-4 week portfolio project with 4-5 main modules, not a multi-year enterprise system with dozens of teams.

### Options Considered

### Option A: Feature-Based (Standard NestJS)

Organize by feature/domain, with all layers in same folder.

```
src/
├── payments/
│   ├── payment.entity.ts
│   ├── payment.service.ts
│   ├── payment.controller.ts
│   ├── payment.repository.ts
│   ├── dto/
│   │   ├── create-payment.dto.ts
│   │   └── payment-response.dto.ts
│   └── payments.module.ts
│
├── webhooks/
│   ├── webhook.controller.ts
│   ├── webhook-processor.service.ts
│   ├── idempotency.service.ts
│   ├── dto/
│   └── webhooks.module.ts
│
├── accounts/
│   ├── account.entity.ts
│   ├── balance.service.ts
│   ├── account.repository.ts
│   └── accounts.module.ts
│
└── shared/
    ├── database/
    ├── config/
    └── utils/

```

**Pros:**

- Simple and intuitive (everything for "payments" is in `payments/`)
- Fast navigation ("where is balance logic?" → `accounts/balance.service.ts`)
- Standard NestJS pattern (familiar to all NestJS developers)
- Minimal setup overhead (~1 hour)
- Easy to onboard new developers

**Cons:**

- Business logic mixed with infrastructure concerns
- Harder to test domain logic in isolation (tightly coupled to database/framework)
- No clear separation between "what" and "how"
- Service layer can become bloated (mixing domain + infrastructure)

### Option B: Hexagonal Architecture (Ports & Adapters)

Organize by architectural layer, with explicit ports and adapters.

```
src/
├── domain/
│   ├── payment/
│   │   ├── payment.entity.ts
│   │   ├── payment.aggregate.ts
│   │   └── payment-repository.interface.ts
│   ├── account/
│   │   ├── account.entity.ts
│   │   └── account.aggregate.ts
│   └── value-objects/
│       ├── money.vo.ts
│       └── currency.vo.ts
│
├── application/
│   ├── use-cases/
│   │   ├── process-payment/
│   │   │   ├── process-payment.usecase.ts
│   │   │   └── process-payment.dto.ts
│   │   └── update-balance/
│   │       ├── update-balance.usecase.ts
│   │       └── update-balance.dto.ts
│   └── ports/
│       ├── payment-repository.port.ts
│       ├── notification.port.ts
│       └── event-bus.port.ts
│
├── infrastructure/
│   ├── persistence/
│   │   ├── typeorm/
│   │   │   ├── payment.repository.ts
│   │   │   └── account.repository.ts
│   │   └── migrations/
│   ├── http/
│   │   ├── controllers/
│   │   │   ├── webhook.controller.ts
│   │   │   └── payment.controller.ts
│   │   └── middleware/
│   ├── messaging/
│   │   ├── bull/
│   │   │   └── webhook-processor.worker.ts
│   │   └── redis/
│   └── external/
│       └── notification.adapter.ts
│
└── shared/
    ├── domain/
    └── infrastructure/

```

**Pros:**

- Clean separation: domain logic completely isolated from infrastructure
- Highly testable: domain can be tested without any dependencies
- Swappable implementations: easy to change database or framework
- DDD-friendly: natural fit for complex business rules
- Impressive on resume (demonstrates advanced architecture knowledge)

**Cons:**

- High complexity overhead (~8-10 hours setup)
- More files and indirection (harder to navigate for newcomers)
- Overkill for small systems (4-5 modules)
- Solves problems this project doesn't have (not changing database or framework)
- Requires deep understanding to implement correctly
- Easy to over-engineer and create unnecessary abstractions

### Option C: Hybrid (Domain/Infrastructure Within Features) ✅ **SELECTED**

Organize by feature top-level, but separate domain from infrastructure within each feature.

```
src/
├── modules/
│   ├── payments/
│   │   ├── domain/
│   │   │   ├── payment.entity.ts
│   │   │   ├── payment.service.ts          # Business logic only
│   │   │   └── payment-types.ts
│   │   ├── infrastructure/
│   │   │   ├── payment.repository.ts        # Database interaction
│   │   │   └── payment.mapper.ts
│   │   ├── api/
│   │   │   ├── payment.controller.ts
│   │   │   └── dto/
│   │   │       ├── create-payment.dto.ts
│   │   │       └── payment-response.dto.ts
│   │   └── payments.module.ts
│   │
│   ├── webhooks/
│   │   ├── domain/
│   │   │   └── webhook-processor.service.ts # Processing logic
│   │   ├── infrastructure/
│   │   │   ├── webhook.repository.ts
│   │   │   ├── idempotency.service.ts       # Redis interaction
│   │   │   └── webhook.worker.ts            # Bull worker
│   │   ├── api/
│   │   │   ├── webhook.controller.ts
│   │   │   └── dto/
│   │   └── webhooks.module.ts
│   │
│   ├── accounts/
│   │   ├── domain/
│   │   │   ├── account.entity.ts
│   │   │   ├── balance.service.ts           # Balance business logic
│   │   │   └── transaction.entity.ts
│   │   ├── infrastructure/
│   │   │   ├── account.repository.ts        # PostgreSQL with FOR UPDATE
│   │   │   └── transaction.repository.ts
│   │   ├── api/
│   │   │   ├── account.controller.ts
│   │   │   └── dto/
│   │   └── accounts.module.ts
│   │
│   └── events/
│       ├── domain/
│       │   └── event-emitter.service.ts
│       ├── infrastructure/
│       │   └── event-store.repository.ts
│       └── events.module.ts
│
├── shared/
│   ├── database/
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── redis/
│   │   ├── redis.module.ts
│   │   └── redis.service.ts
│   ├── queue/
│   │   └── queue.module.ts
│   └── config/
│       └── configuration.ts
│
├── common/
│   ├── decorators/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   └── exceptions/
│
└── app.module.ts

```

**Pros:**

- Balance: separation of concerns without over-engineering
- Easy navigation: "payments logic?" → `modules/payments/domain/`
- Testable: domain logic isolated from infrastructure
- Familiar structure: feature-based top level (standard NestJS)
- Reasonable setup time (~3-4 hours)
- Scalable: can evolve to full hexagonal if needed

**Cons:**

- Not as "pure" as full hexagonal (some coupling remains)
- Requires discipline to maintain boundaries
- Slightly more folders than feature-based pure

### Decision

**Use Hybrid Structure: Domain/Infrastructure Within Features (Option C)**

### Rationale

1. **Pragmatic Balance:** Gets 80% of hexagonal's benefits (separation, testability) with 30% of the complexity overhead.
2. **Project Scope Appropriate:** For a 4-5 module system built in 3-4 weeks, full hexagonal is over-engineering. But pure feature-based sacrifices testability unnecessarily.
3. **Separation of Concerns:** Domain logic (business rules) separated from infrastructure (database, queue, Redis) makes testing easier without ports/adapters complexity.
4. **Developer Experience:** Easy to navigate - all "payments" code is under `modules/payments/`, but internally organized by concern.
5. **Interview Defense:** Demonstrates understanding of hexagonal principles while showing pragmatic decision-making. "I know advanced architecture but choose appropriate complexity for the problem."
6. **Real-World Pattern:** Many production systems (including at companies like Uber, Shopify) use this hybrid approach rather than pure hexagonal.
7. **Time Investment:** ~3-4 hours setup vs 8-10 hours for hexagonal. The saved time goes to better testing, documentation, deployment.

### Structure Guidelines

### Domain Layer

```tsx
// modules/accounts/domain/balance.service.ts
@Injectable()
export class BalanceService {
  constructor(
    private accountRepo: AccountRepository,  // Injected, but interface lives in domain
    private transactionRepo: TransactionRepository
  ) {}

  // Pure business logic - no database details
  async updateBalance(
    accountId: string,
    amount: number,
    type: string
  ): Promise<void> {
    // Business rules here
    if (amount === 0) throw new BadRequestException('Amount cannot be zero');

    // Delegates to repository (infrastructure concern)
    await this.accountRepo.updateBalanceWithTransaction(accountId, amount, type);
  }
}

```

**Domain contains:**

- Entities (domain models)
- Business logic services
- Domain events
- Business rules and validations
- **NO** database queries, HTTP calls, queue operations

### Infrastructure Layer

```tsx
// modules/accounts/infrastructure/account.repository.ts
@Injectable()
export class AccountRepository {
  constructor(private db: DatabaseService) {}

  // Infrastructure concern - HOW to update balance
  async updateBalanceWithTransaction(
    accountId: string,
    amount: number,
    type: string
  ): Promise<void> {
    await this.db.transaction(async (trx) => {
      const account = await trx('accounts')
        .where({ id: accountId })
        .forUpdate()  // PostgreSQL-specific locking
        .first();

      const newBalance = account.balance + amount;
      if (newBalance < 0) throw new InsufficientFundsException();

      await trx('accounts').update({ balance: newBalance }).where({ id: accountId });
      await trx('transactions').insert({ account_id: accountId, amount, type });
    });
  }
}

```

**Infrastructure contains:**

- Repositories (database interaction)
- External API clients
- Queue workers
- Redis/cache services
- **NO** business logic

### API Layer

```tsx
// modules/accounts/api/account.controller.ts
@Controller('accounts')
export class AccountController {
  constructor(private balanceService: BalanceService) {}

  @Get(':id/balance')
  async getBalance(@Param('id') id: string) {
    const balance = await this.balanceService.getBalance(id);
    return { balance };
  }

  // Controller handles HTTP concerns only
  // Business logic delegated to domain layer
}

```

**API contains:**

- Controllers (HTTP endpoints)
- DTOs (request/response validation)
- HTTP-specific middleware
- **NO** business logic

### Folder Organization Rules

1. **Domain First:** When creating a new feature, start with domain entities and services
2. **Infrastructure Implements:** Repositories and external services support domain logic
3. **API is Thin:** Controllers are just routing layer, delegate to domain
4. **No Cross-Layer Leakage:** Domain NEVER imports from infrastructure or api
5. **Shared is Infrastructure:** Common database, redis, queue setup goes in `/shared`

### Module Structure Example

```tsx
// modules/payments/payments.module.ts
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventsModule
  ],
  controllers: [
    PaymentController  // from api/
  ],
  providers: [
    // Domain services
    PaymentService,

    // Infrastructure
    PaymentRepository,
    PaymentMapper
  ],
  exports: [PaymentService]
})
export class PaymentsModule {}

```

### Testing Benefits

**Domain Testing (No Infrastructure):**

```tsx
// Easy to test - pure business logic
describe('BalanceService', () => {
  let service: BalanceService;
  let mockRepo: jest.Mocked<AccountRepository>;

  beforeEach(() => {
    mockRepo = {
      updateBalanceWithTransaction: jest.fn(),
      getBalance: jest.fn()
    } as any;

    service = new BalanceService(mockRepo, mockTransactionRepo);
  });

  it('should reject zero amount', async () => {
    await expect(
      service.updateBalance('acc1', 0, 'deposit')
    ).rejects.toThrow('Amount cannot be zero');

    expect(mockRepo.updateBalanceWithTransaction).not.toHaveBeenCalled();
  });
});

```

**Infrastructure Testing (Integration):**

```tsx
// Test actual database interaction
describe('AccountRepository', () => {
  let repo: AccountRepository;
  let testDb: TestDatabase;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    repo = new AccountRepository(testDb);
  });

  it('should update balance with FOR UPDATE lock', async () => {
    const account = await testDb.createAccount({ balance: 100 });

    await repo.updateBalanceWithTransaction(account.id, 50, 'deposit');

    const updated = await testDb.getAccount(account.id);
    expect(updated.balance).toBe(150);
  });
});

```

### Migration Path

If project grows and needs full hexagonal:

```
Current:
modules/payments/domain/payment.service.ts
  → uses: PaymentRepository (concrete class)

Future hexagonal:
domain/payment/payment.service.ts
  → uses: IPaymentRepository (interface)
infrastructure/persistence/payment.repository.ts
  → implements: IPaymentRepository

Migration: Extract interfaces, move domain/ up one level
Effort: ~4-6 hours

```

**The hybrid structure makes this migration easy if needed.**

### Consequences

**Positive:**

- ✅ Clean separation of business logic from infrastructure
- ✅ Testable domain layer without mocking database
- ✅ Easy navigation (feature-based top level)
- ✅ Familiar to NestJS developers (not exotic structure)
- ✅ Scalable (can grow to full hexagonal if needed)
- ✅ Demonstrates architectural understanding without over-engineering

**Negative:**

- ⚠️ Not as "pure" as hexagonal (some coupling remains)
- ⚠️ Requires discipline to maintain boundaries (easy to leak infrastructure into domain)
- ⚠️ More folders than simple feature-based

**Neutral:**

- Setup time: ~3-4 hours (acceptable for benefits gained)
- Learning curve: Medium (developers need to understand layer separation)

### Interview Defense

**If asked: "Why not full hexagonal architecture?"**

> "I considered hexagonal but decided against it because this system has 4-5 modules and won't need to swap databases or frameworks. Full hexagonal would add 6-8 hours of setup for ports/adapters that wouldn't provide value at this scale.
> 
> 
> Instead, I used a hybrid approach: feature-based structure with domain/infrastructure separation within each module. This gives me the key benefit of hexagonal (testable business logic) without the overhead.
> 
> I prioritized delivering a working, well-tested system over architectural purity."
> 

**If asked: "What's in domain vs infrastructure?"**

> "Domain contains business logic and rules that would be true regardless of database or framework. For example, 'balance cannot be negative' or 'webhook must be processed exactly once'.
> 
> 
> Infrastructure contains implementation details: PostgreSQL queries, Redis operations, Bull workers. These are the 'how' while domain is the 'what'.
> 
> This separation makes domain logic testable without spinning up databases."
> 

**If asked: "How do you prevent domain from leaking into infrastructure?"**

> "Code reviews and discipline. Domain layer never imports from infrastructure or api folders. If domain needs something from infrastructure, it's injected as a dependency.
> 
> 
> For example, BalanceService (domain) doesn't know about PostgreSQL transactions or FOR UPDATE - that's in AccountRepository (infrastructure). Domain just calls `repository.updateBalance()` and trusts it handles concurrency correctly."
> 

### Comparison to Alternatives

| Aspect | Feature-Based | Hybrid | Hexagonal |
| --- | --- | --- | --- |
| Setup time | 1h | 3h | 8h |
| Navigation | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Testability | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Complexity | Low | Medium | High |
| Scalability | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Interview wow | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Pragmatism | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |

**For this project: Hybrid is optimal.**

### Implementation Checklist

When creating new module:

1. Create `modules/[module-name]/` folder
2. Add `domain/` folder with business logic
3. Add `infrastructure/` folder with database/external services
4. Add `api/` folder with controllers and DTOs
5. Create `[module-name].module.ts` with proper imports
6. Ensure domain never imports from infrastructure or api
7. Write tests for domain (unit) and infrastructure (integration)

### References

- NestJS Documentation: https://docs.nestjs.com/
- Clean Architecture (Uncle Bob): https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
- Hexagonal Architecture: https://alistair.cockburn.us/hexagonal-architecture/
- Domain-Driven Design Lite: https://github.com/ddd-crew/ddd-starter-modelling-process

---

## General Principles Guiding All Decisions

1. **Pragmatic over Perfect:** Choose solutions that fit the scope and timeline
2. **Demonstrate Judgment:** Show understanding of trade-offs, not just technical knowledge
3. **Production-Ready Thinking:** Error handling, testing, monitoring from the start
4. **Interview-Friendly:** Can explain and defend every decision
5. **Time-Boxed:** 3-4 weeks total, must finish to deploy

---

## References & Resources

### Event Sourcing vs State-Based

- Martin Fowler: "Event Sourcing" - https://martinfowler.com/eaaDev/EventSourcing.html
- When NOT to use Event Sourcing - https://blog.bitsrc.io/why-you-dont-need-event-sourcing

### Idempotency Patterns

- Stripe API Idempotency: https://stripe.com/docs/api/idempotent_requests
- AWS Best Practices: Idempotency in Distributed Systems

### NestJS Best Practices

- NestJS Documentation: https://docs.nestjs.com/
- NestJS Microservices Patterns

---

## Changelog

### 2026-01-14 - Initial Architecture Planning Session

**Morning Session:**

- ✅ Project context established (payment orchestration layer, not processor)
- ✅ Reviewed existing CV and portfolio strategy
- ✅ Created ADR document structure
- ✅ Decision #1: Data Persistence Strategy
    - Evaluated: State-based, Event Sourcing, Hybrid
    - Selected: Hybrid (cached + immutable transactions)
    - Rationale: Balance of performance and audit trail

**Afternoon Session:**

- ✅ Decision #2: Webhook Idempotency Strategy
    - Evaluated: Database-only, Redis-only, Both
    - Selected: Database + Redis (defense in depth)
    - Rationale: Fast path (Redis) with durability (database)
- ✅ Decision #3: Async Processing Strategy
    - Evaluated: Synchronous, Queue-based, Hybrid
    - Selected: Bull queue with background workers
    - Rationale: Fast webhook response + controlled retry logic
- ✅ Decision #4: Balance Management & Concurrency
    - Evaluated: Simple cached, Immutable-only, Cached+Immutable, Double-entry
    - Selected: Cached balance + immutable transactions + FOR UPDATE locking
    - Rationale: Industry standard (Stripe pattern), handles race conditions
- ✅ Decision #5: Module Structure
    - Evaluated: Feature-based, Hexagonal, Hybrid
    - Selected: Hybrid (domain/infrastructure within features)
    - Rationale: Separation of concerns without over-engineering

**Status:** Core architecture fully defined and documented

**Next Milestones:**

1. Implementation roadmap (week-by-week breakdown)
2. Database schema definition
3. API endpoint specification
4. Development begins

**Next Review:** After Week 1 implementation (Payment module complete)
