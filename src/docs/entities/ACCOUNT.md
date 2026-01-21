## 1. Account

**Purpose:** Represents a user's financial account with balance tracking and reservation support for pending transactions.

**Responsibility:** 
- Holds total funds and reserved funds
- Source of truth for balance reads
- Supports multi-currency (one account per user per currency)

**Key Rules:** 
- Balance cannot be negative
- Reserved balance cannot exceed total balance
- One primary account per user

**Concurrency:** Uses pessimistic locking (`FOR UPDATE`) during balance modifications to prevent race conditions.

### Fields:

#### Core Identity
- `id` (UUID, PK): Unique account identifier
- `user_id` (UUID, indexed): Reference to owning user (external system)
- `is_primary` (Boolean): Indicates user's primary account. Default `true`

#### Balance Management
- `balance` (Decimal 19,4): Total funds in account. Default `0`
- `reserved_balance` (Decimal 19,4): Funds reserved for pending transactions. Default `0`
- `available_balance` (Computed): Spendable funds. Formula: `balance - reserved_balance`

#### Currency & Status
- `currency` (String, 3 chars): ISO 4217 code. Default `'USD'`
  Enum: `'USD' | 'EUR' | 'ARS' | 'GBP'`
- `status` (String): Account operational status. Default `'active'`
  Enum: `'active' | 'frozen' | 'suspended' | 'closed'`

#### Metadata & Timestamps
- `metadata` (JSONB): Optional unstructured data. Default `{}`
- `created_at` (Timestamp): Account creation timestamp
- `updated_at` (Timestamp): Last modification timestamp (auto-updated)

### Constraints:
- `CHECK (balance >= 0)`: Balance cannot be negative
- `CHECK (reserved_balance >= 0)`: Reserved balance cannot be negative
- `CHECK (balance >= reserved_balance)`: Reserved cannot exceed total
- `UNIQUE (user_id, currency)`: One account per user per currency
- `UNIQUE (user_id) WHERE is_primary = true`: Only one primary account per user

### Indexes:
- `PRIMARY KEY (id)`
- `INDEX (user_id)`
- `INDEX (status)`
- `UNIQUE INDEX (user_id, currency)`
- `PARTIAL UNIQUE INDEX (user_id) WHERE is_primary = true`

### Relationships:
- `Account` → `Payment` (ONE to MANY)
- `Account` → `Transaction` (ONE to MANY)
