## 2. Transaction (Ledger)
**Purpose:** The **immutable audit log** (append-only) of every financial movement.
- **Responsibility:** Complete financial audit trail. The sum of all transactions for an account must theoretically equal the `Account` balance.
- **Types:** `payment_received`, `refund`, `withdrawal`, `deposit`.
- **Relationship:** Belongs to an `Account`.

### Fields:
- `id` (UUID, PK): Unique identifier.
- `account_id` (UUID, FK): Links to the `Account`.
- `amount` (Decimal 19,4): The movement value (positive for credit, negative for debit). Cannot be `0`.
- `type` (String/Enum): The reason for the transaction (e.g., 'payment_in', 'refund').
- `reference_id` (UUID, Optional): ID of the related entity (e.g., `payment_id`).
- `metadata` (JSONB): Contextual data (e.g., descriptions, admin notes).
- `created_at` (Timestamp): When the movement occurred.

### Indexes:
- PRIMARY KEY (id)
- INDEX (account_id)
- INDEX (created_at)
- INDEX (reference_id)
---