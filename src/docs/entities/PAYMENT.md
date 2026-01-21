## 3. Payment

**Purpose:** Tracks the lifecycle of a payment through external provider (Stripe, PayPal, Mock).

**Responsibility:** 
- Manages payment state machine
- Links internal account to external provider payment
- Audit trail of payment attempts

**State Machine:**
- `pending` → `processing` → `succeeded`
- `pending` → `processing` → `failed`
- `succeeded` → `refunded`
- `pending` → `cancelled`

### Fields:

#### Core Identity
- `id` (UUID, PK): Unique payment identifier
- `account_id` (UUID, FK, indexed): Links to Account
  FK: `account.id` ON DELETE RESTRICT

#### Payment Details
- `amount` (Decimal 19,4): Payment value (must be positive)
- `currency` (String, 3 chars): ISO 4217 code
- `description` (Text, nullable): Payment description

#### Status & Provider
- `status` (Enum): Payment state. Default `'pending'`
  Values: `'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'cancelled'`
- `provider` (String, 50): External processor. E.g., `'stripe'`, `'paypal'`, `'mock'`
- `external_payment_id` (String, 255, UNIQUE, indexed): Provider's payment ID
- `payment_method` (String, 50, nullable): Method used. E.g., `'card'`, `'bank_transfer'`

#### Metadata & Timestamps
- `metadata` (JSONB): Additional payment data. Default `{}`
- `created_at` (Timestamp, indexed): Payment creation timestamp
- `updated_at` (Timestamp): Last status change
- `processed_at` (Timestamp, nullable): When payment reached final state

### Constraints:
- `CHECK (amount > 0)`: Amount must be positive
- `UNIQUE (external_payment_id)`: Provider ID must be unique

### Indexes:
- `PRIMARY KEY (id)`
- `INDEX (account_id)`
- `INDEX (status)`
- `UNIQUE INDEX (external_payment_id)`
- `INDEX (created_at)`
- `COMPOUND INDEX (account_id, status)`
- `COMPOUND INDEX (account_id, created_at DESC)`

### Relationships:
- `Payment` → `Account` (MANY to ONE)

### Status Definitions:
- `pending`: Created internally, not yet sent to provider
- `processing`: Sent to provider, awaiting webhook confirmation
- `succeeded`: Successfully confirmed by provider
- `failed`: Rejected by provider or validation error
- `refunded`: Funds returned to source
- `cancelled`: Cancelled before processing
