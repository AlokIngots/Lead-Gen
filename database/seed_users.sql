USE alok_lms;

-- Dev seed users for OTP-based login.
-- In mock SMS_MODE the OTP is returned in the /auth/login response (dev_otp),
-- so the phone numbers below are placeholders. Replace with real numbers
-- before switching SMS_MODE to interakt or live.

INSERT INTO v2_users (ecode, name, role, phone, country_code, is_active) VALUES
    ('EMP001', 'Alok',      'admin', '9999999001', '+91', 1),
    ('EMP005', 'Mrunali',   'sc',    '9999999005', '+91', 1),
    ('EMP007', 'Nilankshi', 'sc',    '9999999007', '+91', 1),
    ('EMP010', 'Johnny',    'sc',    '9999999010', '+91', 1),
    ('EMP016', 'Renu',      'sc',    '9999999016', '+91', 1),
    ('EMP017', 'Sumitra',   'sc',    '9999999017', '+91', 1),
    ('EMP018', 'Maikel',    'sc',    '9999999018', '+91', 1),
    ('EMP019', 'Rajendra',  'sc',    '9999999019', '+91', 1),
    ('EMP020', 'Ruchir',    'sc',    '9999999020', '+91', 1)
ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    role = VALUES(role),
    phone = VALUES(phone),
    country_code = VALUES(country_code),
    is_active = VALUES(is_active);
