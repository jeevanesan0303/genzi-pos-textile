CREATE TABLE IF NOT EXISTS receipt_sms_links (
    order_id VARCHAR(64)
        CHARACTER SET ascii
        COLLATE ascii_bin
        NOT NULL,

    token CHAR(48)
        CHARACTER SET ascii
        COLLATE ascii_bin
        NOT NULL,

    expires_at DATETIME NOT NULL,

    send_state VARCHAR(16)
        NOT NULL DEFAULT 'new',

    destination VARCHAR(12) NULL,

    attempted_at DATETIME NULL,

    sent_at DATETIME NULL,

    created_at DATETIME
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (order_id),

    UNIQUE KEY uq_receipt_sms_token (token)
) ENGINE=InnoDB;