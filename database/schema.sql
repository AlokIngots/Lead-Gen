-- Alok LMS — MySQL schema
-- Target: MySQL 8.0+ / 9.x
-- Designed to hold ~500k leads and associated campaign state.

CREATE DATABASE IF NOT EXISTS alok_lms
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE alok_lms;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS campaign_events;
DROP TABLE IF EXISTS lead_drip_state;
DROP TABLE IF EXISTS campaign_steps;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS templates;
DROP TABLE IF EXISTS import_batches;
DROP TABLE IF EXISTS leads;
DROP TABLE IF EXISTS v2_users;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- v2_users — mirrors the CRM's v2_users table exactly so that JWTs issued
-- by either service are interchangeable (shared JWT_SECRET_KEY).
-- ---------------------------------------------------------------------------
CREATE TABLE v2_users (
    ecode         VARCHAR(32)   NOT NULL,
    name          VARCHAR(128)  NOT NULL,
    role          VARCHAR(32)   NOT NULL,
    phone         VARCHAR(32)   NULL,
    country_code  VARCHAR(8)    NULL,
    is_active     TINYINT(1)    NOT NULL DEFAULT 1,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (ecode),
    KEY idx_v2_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------
CREATE TABLE leads (
    id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_name     VARCHAR(255)    NOT NULL,
    contact_name     VARCHAR(255)    NULL,
    designation      VARCHAR(128)    NULL,
    email            VARCHAR(255)    NULL,
    phone            VARCHAR(32)     NULL,
    alt_phone        VARCHAR(32)     NULL,
    website          VARCHAR(255)    NULL,
    address_line1    VARCHAR(255)    NULL,
    address_line2    VARCHAR(255)    NULL,
    city             VARCHAR(128)    NULL,
    state            VARCHAR(128)    NULL,
    pincode          VARCHAR(16)     NULL,
    country          VARCHAR(64)     NOT NULL DEFAULT 'India',

    industry_segment ENUM(
        'pumps',
        'valves',
        'pneumatics',
        'defense',
        'stockholders',
        'cnc',
        'forging',
        'others'
    ) NOT NULL DEFAULT 'others',

    sub_segment      VARCHAR(128)    NULL,
    annual_revenue   DECIMAL(18, 2)  NULL,
    employee_count   INT UNSIGNED    NULL,

    status ENUM(
        'new',
        'contacted',
        'qualified',
        'proposal',
        'negotiation',
        'won',
        'lost',
        'nurture',
        'disqualified'
    ) NOT NULL DEFAULT 'new',

    score            SMALLINT UNSIGNED NOT NULL DEFAULT 0,       -- 0..100
    assigned_sc      VARCHAR(64)     NULL,                       -- sales coordinator handle
    owner_user_id    BIGINT UNSIGNED NULL,

    source           VARCHAR(64)     NOT NULL DEFAULT 'import',  -- import|web|referral|event|manual
    source_detail    VARCHAR(255)    NULL,

    dnc_flag         TINYINT(1)      NOT NULL DEFAULT 0,
    bounce_flag      TINYINT(1)      NOT NULL DEFAULT 0,
    unsubscribed     TINYINT(1)      NOT NULL DEFAULT 0,

    last_contacted_at DATETIME       NULL,
    next_action_at    DATETIME       NULL,

    import_batch_id  BIGINT UNSIGNED NULL,

    notes            TEXT            NULL,
    tags             JSON            NULL,

    created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    KEY idx_leads_status            (status),
    KEY idx_leads_segment           (industry_segment),
    KEY idx_leads_assigned_sc       (assigned_sc),
    KEY idx_leads_score             (score),
    KEY idx_leads_dnc               (dnc_flag),
    KEY idx_leads_bounce            (bounce_flag),
    KEY idx_leads_source            (source),
    KEY idx_leads_next_action       (next_action_at),
    KEY idx_leads_company_name      (company_name),
    KEY idx_leads_email             (email),
    KEY idx_leads_phone             (phone),
    KEY idx_leads_segment_status    (industry_segment, status),
    KEY idx_leads_import_batch      (import_batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------
CREATE TABLE import_batches (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    filename        VARCHAR(255)    NOT NULL,
    uploaded_by     VARCHAR(128)    NULL,
    total_rows      INT UNSIGNED    NOT NULL DEFAULT 0,
    inserted_rows   INT UNSIGNED    NOT NULL DEFAULT 0,
    updated_rows    INT UNSIGNED    NOT NULL DEFAULT 0,
    skipped_rows    INT UNSIGNED    NOT NULL DEFAULT 0,
    error_rows      INT UNSIGNED    NOT NULL DEFAULT 0,
    status          ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
    error_log       TEXT            NULL,
    mapping_json    JSON            NULL,
    started_at      DATETIME        NULL,
    finished_at     DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_import_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- templates  (email/sms/whatsapp templates used by campaign steps)
-- ---------------------------------------------------------------------------
CREATE TABLE templates (
    id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(128)    NOT NULL,
    channel      ENUM('email','sms','whatsapp','call_script') NOT NULL,
    subject      VARCHAR(255)    NULL,
    body         MEDIUMTEXT      NOT NULL,
    variables    JSON            NULL,
    active       TINYINT(1)      NOT NULL DEFAULT 1,
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_templates_name_channel (name, channel),
    KEY idx_templates_channel (channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- campaigns
-- ---------------------------------------------------------------------------
CREATE TABLE campaigns (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name            VARCHAR(128)    NOT NULL,
    description     TEXT            NULL,
    segment_filter  ENUM(
        'pumps','valves','pneumatics','defense',
        'stockholders','cnc','forging','others','all'
    ) NOT NULL DEFAULT 'all',
    status_filter   VARCHAR(64)     NULL,
    status          ENUM('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
    start_at        DATETIME        NULL,
    end_at          DATETIME        NULL,
    created_by      VARCHAR(128)    NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_campaigns_status (status),
    KEY idx_campaigns_segment (segment_filter)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- campaign_steps  (the drip definition)
-- ---------------------------------------------------------------------------
CREATE TABLE campaign_steps (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    campaign_id     BIGINT UNSIGNED NOT NULL,
    step_order      INT UNSIGNED    NOT NULL,
    channel         ENUM('email','sms','whatsapp','call','task') NOT NULL,
    template_id     BIGINT UNSIGNED NULL,
    delay_days      INT UNSIGNED    NOT NULL DEFAULT 0,
    delay_hours     INT UNSIGNED    NOT NULL DEFAULT 0,
    condition_json  JSON            NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_campaign_step_order (campaign_id, step_order),
    KEY idx_campaign_steps_campaign (campaign_id),
    KEY idx_campaign_steps_template (template_id),
    CONSTRAINT fk_campaign_steps_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_campaign_steps_template FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- lead_drip_state  (per-lead enrollment in a campaign)
-- ---------------------------------------------------------------------------
CREATE TABLE lead_drip_state (
    id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lead_id           BIGINT UNSIGNED NOT NULL,
    campaign_id       BIGINT UNSIGNED NOT NULL,
    current_step      INT UNSIGNED    NOT NULL DEFAULT 0,
    status            ENUM('active','paused','completed','exited','failed') NOT NULL DEFAULT 'active',
    next_run_at       DATETIME        NULL,
    last_step_at      DATETIME        NULL,
    attempts          INT UNSIGNED    NOT NULL DEFAULT 0,
    enrolled_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_drip_lead_campaign (lead_id, campaign_id),
    KEY idx_drip_status (status),
    KEY idx_drip_next_run (next_run_at),
    CONSTRAINT fk_drip_lead     FOREIGN KEY (lead_id)     REFERENCES leads(id)     ON DELETE CASCADE,
    CONSTRAINT fk_drip_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- campaign_events  (touchpoint log)
-- ---------------------------------------------------------------------------
CREATE TABLE campaign_events (
    id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    lead_id       BIGINT UNSIGNED NOT NULL,
    campaign_id   BIGINT UNSIGNED NULL,
    step_id       BIGINT UNSIGNED NULL,
    event_type    ENUM(
        'sent','delivered','opened','clicked','replied',
        'bounced','unsubscribed','failed','call_made','call_answered','note'
    ) NOT NULL,
    channel       ENUM('email','sms','whatsapp','call','task','system') NOT NULL DEFAULT 'system',
    payload       JSON            NULL,
    occurred_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_events_lead       (lead_id),
    KEY idx_events_campaign   (campaign_id),
    KEY idx_events_type       (event_type),
    KEY idx_events_occurred   (occurred_at),
    CONSTRAINT fk_events_lead     FOREIGN KEY (lead_id)     REFERENCES leads(id)          ON DELETE CASCADE,
    CONSTRAINT fk_events_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id)      ON DELETE SET NULL,
    CONSTRAINT fk_events_step     FOREIGN KEY (step_id)     REFERENCES campaign_steps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
