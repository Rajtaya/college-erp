-- ═══════════════════════════════════════════════════════════════════════════
-- PATCH B — Money-handling audit trail
-- Creates tables for payment audit + daily cashier sessions
-- Safe to run multiple times (uses IF NOT EXISTS / checks)
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. Add WAIVED to fees.status enum ───────────────────────────────────────
ALTER TABLE fees
  MODIFY COLUMN status ENUM('PENDING','PAID','OVERDUE','WAIVED') DEFAULT 'PENDING';

-- ── 2. cashier_sessions — daily open/close per fee clerk ────────────────────
CREATE TABLE IF NOT EXISTS cashier_sessions (
  session_id        INT AUTO_INCREMENT PRIMARY KEY,
  fee_clerk_id      INT NOT NULL,
  opened_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at         DATETIME DEFAULT NULL,
  opening_notes     VARCHAR(500) DEFAULT NULL,
  closing_notes     VARCHAR(500) DEFAULT NULL,
  -- Totals populated on close (keeps reports fast, avoids recomputing)
  total_cash        DECIMAL(12,2) DEFAULT 0.00,
  total_upi         DECIMAL(12,2) DEFAULT 0.00,
  total_neft_rtgs   DECIMAL(12,2) DEFAULT 0.00,
  total_card        DECIMAL(12,2) DEFAULT 0.00,
  total_collected   DECIMAL(12,2) DEFAULT 0.00,
  total_waived      DECIMAL(12,2) DEFAULT 0.00,
  receipt_count     INT DEFAULT 0,
  status            ENUM('OPEN','CLOSED') DEFAULT 'OPEN',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_session_clerk
    FOREIGN KEY (fee_clerk_id) REFERENCES fee_clerks(fee_clerk_id),
  INDEX idx_session_clerk_status (fee_clerk_id, status),
  INDEX idx_session_opened (opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enforce: only one OPEN session per clerk at a time
-- (Implemented via unique index on (fee_clerk_id, status='OPEN' virtual col))
ALTER TABLE cashier_sessions
  ADD COLUMN is_open TINYINT(1) AS (IF(status='OPEN', 1, NULL)) STORED,
  ADD UNIQUE KEY uq_one_open_session_per_clerk (fee_clerk_id, is_open);

-- ── 3. fee_payments — immutable audit trail ─────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_payments (
  payment_id        INT AUTO_INCREMENT PRIMARY KEY,
  fee_id            INT NOT NULL,
  session_id        INT DEFAULT NULL,
  type              ENUM('COLLECT','WAIVE') NOT NULL,
  amount            DECIMAL(10,2) NOT NULL,
  payment_method    ENUM('CASH','UPI','NEFT_RTGS','CARD','WAIVER') NOT NULL,
  transaction_ref   VARCHAR(100) NOT NULL,
  reference_details VARCHAR(255) DEFAULT NULL,  -- UPI ref, NEFT UTR, card last4, cheque no, etc.
  reason            VARCHAR(500) DEFAULT NULL,  -- required for WAIVE, optional otherwise
  collected_by      INT NOT NULL,               -- fee_clerk_id or admin user_id
  collected_by_role ENUM('fee_clerk','admin') NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_payment_fee
    FOREIGN KEY (fee_id) REFERENCES fees(fee_id),
  CONSTRAINT fk_payment_session
    FOREIGN KEY (session_id) REFERENCES cashier_sessions(session_id),
  INDEX idx_payment_fee (fee_id),
  INDEX idx_payment_session (session_id),
  INDEX idx_payment_created (created_at),
  INDEX idx_payment_by (collected_by, collected_by_role),
  UNIQUE KEY uq_transaction_ref (transaction_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. Verify ───────────────────────────────────────────────────────────────
SHOW TABLES LIKE 'fee_payments';
SHOW TABLES LIKE 'cashier_sessions';
SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='college_erp' AND TABLE_NAME='fees' AND COLUMN_NAME='status';
