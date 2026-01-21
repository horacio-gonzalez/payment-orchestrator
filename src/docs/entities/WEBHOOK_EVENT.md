## 4. WebhookEvent

**Purpose:** Idempotency layer for incoming provider webhooks. Prevents duplicate processing.

**Responsibility:**
- Store raw webhook payload
- Track processing status
- Deduplicate by external_id

**Mechanism:** 
- Check `external_id` before processing
- If exists, reject as duplicate
- Serves as fallback if Redis cache unavailable

### Fields:

#### Core Identity
- `id` (UUID, PK): Internal identifier
- `external_id` (String, 255, UNIQUE, indexed): Provider's event ID. **Critical for idempotency**

#### Webhook Details
- `provider` (String, 50, indexed): Source of webhook. E.g., `'stripe'`, `'paypal'`
- `event_type` (String, 100): Webhook event type. E.g., `'payment.succeeded'`, `'payment.failed'`
- `payload` (JSONB): Full raw webhook body

#### Processing Status
- `status` (Enum): Processing state. Default `'pending'`
  Values: `'pending' | 'processed' | 'failed' | 'duplicate'`
- `error_message` (Text, nullable): Error details if processing failed

#### Timestamps
- `created_at` (Timestamp, indexed): Reception timestamp
- `processed_at` (Timestamp, nullable): When successfully processed

### Constraints:
- `UNIQUE (external_id)`: Prevent duplicate webhook processing

### Indexes:
- `PRIMARY KEY (id)`
- `UNIQUE INDEX (external_id)`
- `INDEX (provider)`
- `INDEX (status)`
- `INDEX (created_at)`

### Relationships:
- Conceptual link to `Payment` via `external_payment_id` matching
- No direct FK (loose coupling)