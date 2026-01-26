# Claude Code Quick Reference

## What This Project Is
**Payment Orchestration Layer** (portfolio project) - procesa webhooks de providers (Stripe, PayPal simulados), maneja balances, audit trail. NO procesamos pagos directamente.

## Context Files
- `PROJECT_CONTEXT.md` - scope completo, tech stack, arquitectura
- `src/docs/ADR.md` - decisiones técnicas detalladas (persistence, idempotency, async, locking)
- Este archivo - referencias rápidas

## Arquitectura Core

### Decisiones Críticas (ver ADR para detalles)
1. **Persistence:** Hybrid (cached balance + immutable transactions)
2. **Idempotency:** Redis (fast) + DB (source of truth)
3. **Async:** Bull queue + workers con transaction wrapping
4. **Concurrency:** Pessimistic locking (FOR UPDATE)
5. **Structure:** Hybrid (domain/infrastructure/api dentro de features)

### Module Structure
```
modules/
├── payments/
│   ├── domain/         # Business logic (services, entities)
│   ├── infrastructure/ # Repositories, external APIs
│   ├── api/            # Controllers, DTOs
│   └── payments.module.ts
```

**Regla:** Domain NO importa infrastructure/api. Infrastructure puede importar domain.

### Database Schema Clave
```sql
-- Cached balance (fast reads)
accounts: id, user_id, balance, currency, created_at, updated_at

-- Immutable audit log
transactions: id, account_id, amount, type, reference_id, metadata, created_at

-- Payment state
payments: id, account_id, amount, status, provider, created_at, updated_at

-- Idempotency
webhook_events: id, external_id (UNIQUE), payload, processed_at, created_at
```

## Bull Queue Pattern (Actual Task)

### Setup
```typescript
// Module
BullModule.registerQueue({
  name: 'webhook-processing',
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
})

// Controller
constructor(@InjectQueue('webhook-processing') private queue: Queue) {}
await this.queue.add('process-payment-webhook', { payment_id, ... });

// Processor
@Processor('webhook-processing')
@Process('process-payment-webhook')
async processWebhook(job: Job) { ... }
```

### CRÍTICO: Transaction Wrapping
```typescript
await this.db.transaction(async (trx) => {
  await trx.payments.updateStatus(...);
  await trx.accounts.increaseBalance(...);
  await trx.audit.log(...);
  // All-or-nothing
});
```

## Dev Preferences
- Respuestas concisas, directas
- No recordar contexto innecesariamente
- No mostrar código completo a menos que se pida
- Señalar errores, pero dejarme arreglarlos
- Desafiar decisiones si no son production-ready

## Current State
- Redis: ✅ Instalado y configurado
- Next: Implementar Bull queue processing para webhooks

## Testing Requirements
- Unit: Cada método de servicio
- Integration: Flows críticos con DB real
- Concurrency: Probar race conditions (FOR UPDATE funciona)
- Target: 80%+ coverage

---
Última actualización: 2026-01-26
