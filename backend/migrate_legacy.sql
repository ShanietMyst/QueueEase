USE queueease;

-- This one-time migration targets the legacy schema currently used by QueueEase.
-- It only adds/backfills columns and indexes; it does not drop tables or rows.

ALTER TABLE users
  MODIFY email VARCHAR(190) NOT NULL,
  MODIFY password VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN contact_number VARCHAR(30) NOT NULL DEFAULT '' AFTER email,
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER password,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

UPDATE users
SET password_hash = password
WHERE password_hash IS NULL
  AND password REGEXP '^\\$2[aby]\\$[0-9]{2}\\$';

CREATE TABLE IF NOT EXISTS administrators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_administrators_email (email)
) ENGINE=InnoDB;

ALTER TABLE schedules
  ADD COLUMN service_date DATE NULL AFTER id,
  ADD COLUMN time_slot VARCHAR(80) NULL AFTER service_date,
  ADD COLUMN capacity INT UNSIGNED NULL AFTER time_slot;

UPDATE schedules
SET service_date = schedule_date,
    time_slot = CONCAT(TIME_FORMAT(start_time, '%h:%i %p'), ' - ', TIME_FORMAT(end_time, '%h:%i %p')),
    capacity = CASE WHEN max_capacity < 1 THEN 1 ELSE max_capacity END;

ALTER TABLE schedules
  MODIFY service_date DATE NOT NULL,
  MODIFY time_slot VARCHAR(80) NOT NULL,
  MODIFY capacity INT UNSIGNED NOT NULL DEFAULT 10,
  MODIFY schedule_date DATE NULL,
  MODIFY start_time TIME NULL,
  MODIFY end_time TIME NULL,
  ADD UNIQUE KEY uq_schedules_date_slot (service_date, time_slot),
  ADD KEY idx_schedules_available_date (is_available, service_date);

ALTER TABLE appointments
  ADD COLUMN schedule_id INT NULL AFTER user_id,
  ADD COLUMN full_name VARCHAR(150) NULL AFTER schedule_id,
  ADD COLUMN contact_number VARCHAR(30) NOT NULL DEFAULT '' AFTER full_name,
  ADD COLUMN email VARCHAR(190) NULL AFTER contact_number,
  ADD COLUMN purpose TEXT NULL AFTER email,
  ADD COLUMN notes VARCHAR(1000) NOT NULL DEFAULT '' AFTER purpose,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

INSERT INTO schedules (service_date, time_slot, capacity, is_available)
SELECT a.appointment_date, a.time_slot,
       GREATEST(COUNT(*), SUM(a.status IN ('Pending', 'Confirmed')), 1), 0
FROM appointments a
LEFT JOIN schedules s
  ON s.service_date = a.appointment_date AND s.time_slot = a.time_slot
WHERE s.id IS NULL AND a.appointment_date IS NOT NULL AND a.time_slot IS NOT NULL
GROUP BY a.appointment_date, a.time_slot;

UPDATE appointments a
JOIN users u ON u.id = a.user_id
JOIN schedules s ON s.service_date = a.appointment_date AND s.time_slot = a.time_slot
SET a.schedule_id = s.id,
    a.full_name = u.full_name,
    a.email = u.email,
    a.purpose = COALESCE(NULLIF(TRIM(a.details), ''), 'Appointment'),
    a.notes = '';

ALTER TABLE appointments
  MODIFY schedule_id INT NOT NULL,
  MODIFY full_name VARCHAR(150) NOT NULL,
  MODIFY email VARCHAR(190) NOT NULL,
  MODIFY purpose TEXT NOT NULL,
  ADD KEY idx_appointments_user_date (user_id, created_at),
  ADD KEY idx_appointments_schedule_status (schedule_id, status),
  ADD CONSTRAINT fk_appointments_schedule FOREIGN KEY (schedule_id) REFERENCES schedules (id);

ALTER TABLE queue_records
  ADD COLUMN service_date DATE NULL AFTER appointment_id,
  ADD COLUMN service_name VARCHAR(80) NOT NULL DEFAULT 'General' AFTER service_date,
  ADD COLUMN queue_number_int INT UNSIGNED NULL AFTER queue_number;

UPDATE queue_records
SET service_date = queue_date,
    queue_number_int = CASE
      WHEN REGEXP_REPLACE(queue_number, '[^0-9]', '') = '' THEN id
      ELSE CAST(REGEXP_REPLACE(queue_number, '[^0-9]', '') AS UNSIGNED)
    END;

ALTER TABLE queue_records
  DROP INDEX queue_number,
  MODIFY service_date DATE NOT NULL,
  MODIFY queue_number_int INT UNSIGNED NOT NULL,
  ADD KEY idx_queue_legacy_number (queue_number),
  ADD KEY idx_queue_order (service_date, service_name, status, queue_number_int);

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_type ENUM('user', 'administrator', 'system') NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created (created_at),
  KEY idx_activity_entity (entity_type, entity_id)
) ENGINE=InnoDB;
