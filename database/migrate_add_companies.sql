-- Migration: add companies table, otp_sessions table, and link leads to companies
-- Run: mysql -u root -p alok_lms < database/migrate_add_companies.sql

USE alok_lms;

-- OTP sessions (database-backed, works across workers)
CREATE TABLE IF NOT EXISTS otp_sessions (
    session_id    VARCHAR(64)  NOT NULL,
    ecode         VARCHAR(32)  NOT NULL,
    otp_hash      VARCHAR(255) NOT NULL,
    phone_number  VARCHAR(32)  NOT NULL,
    verified      TINYINT(1)   NOT NULL DEFAULT 0,
    attempts      INT UNSIGNED NOT NULL DEFAULT 0,
    expires_at    DATETIME     NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id),
    KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS companies (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name             VARCHAR(255)    NOT NULL,
    industry_segment ENUM(
        'pumps','valves','pneumatics','defense',
        'stockholders','cnc','forging','others'
    ) NOT NULL DEFAULT 'others',
    country          VARCHAR(64)     NOT NULL DEFAULT 'India',
    total_scraped    INT UNSIGNED    NOT NULL DEFAULT 0,
    emails_sent      INT UNSIGNED    NOT NULL DEFAULT 0,
    scrapped_date    DATE            NULL,
    status           VARCHAR(64)     NULL,
    source_tab       VARCHAR(128)    NULL,
    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_companies_name_segment (name, industry_segment),
    KEY idx_companies_segment (industry_segment),
    KEY idx_companies_status  (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    token_hash   VARCHAR(255)    NOT NULL,
    ecode        VARCHAR(32)     NOT NULL,
    expires_at   DATETIME        NOT NULL,
    revoked      TINYINT(1)      NOT NULL DEFAULT 0,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_refresh_token_hash (token_hash),
    KEY idx_refresh_ecode    (ecode),
    KEY idx_refresh_expires  (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_ecode   VARCHAR(32)     NOT NULL,
    action       VARCHAR(64)     NOT NULL,
    entity_type  VARCHAR(64)     NOT NULL,
    entity_id    VARCHAR(64)     NULL,
    details      JSON            NULL,
    ip_address   VARCHAR(45)     NULL,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_user    (user_ecode),
    KEY idx_audit_action  (action),
    KEY idx_audit_entity  (entity_type),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add company_id FK to leads (idempotent — ignore if already exists)
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'alok_lms' AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'company_id'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE leads ADD COLUMN company_id BIGINT UNSIGNED NULL, ADD KEY idx_leads_company_id (company_id), ADD CONSTRAINT fk_leads_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL',
    'SELECT 1'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
