CREATE DATABASE IF NOT EXISTS queueease
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE queueease;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  contact_number VARCHAR(30) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NULL,
  password VARCHAR(255) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS administrators (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_administrators_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_date DATE NOT NULL,
  time_slot VARCHAR(80) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  schedule_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_schedules_date_slot (service_date, time_slot),
  KEY idx_schedules_available_date (is_available, service_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  schedule_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  email VARCHAR(190) NOT NULL,
  purpose TEXT NOT NULL,
  notes VARCHAR(1000) NOT NULL DEFAULT '',
  appointment_date DATE NULL,
  time_slot VARCHAR(50) NULL,
  details TEXT NULL,
  status ENUM('Pending', 'Confirmed', 'Rejected', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_appointments_user_date (user_id, created_at),
  KEY idx_appointments_schedule_status (schedule_id, status),
  CONSTRAINT fk_appointments_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_appointments_schedule FOREIGN KEY (schedule_id) REFERENCES schedules (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS queue_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  appointment_id BIGINT UNSIGNED NOT NULL,
  queue_number VARCHAR(20) NOT NULL,
  queue_number_int INT UNSIGNED NOT NULL,
  service_date DATE NOT NULL,
  service_name VARCHAR(80) NOT NULL DEFAULT 'General',
  queue_date DATE NULL,
  status ENUM('Waiting', 'Serving', 'Completed', 'Skipped', 'Cancelled') NOT NULL DEFAULT 'Waiting',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_queue_appointment (appointment_id),
  UNIQUE KEY uq_queue_daily_number (service_date, service_name, queue_number_int),
  KEY idx_queue_order (service_date, service_name, status, queue_number_int),
  CONSTRAINT fk_queue_appointment FOREIGN KEY (appointment_id) REFERENCES appointments (id)
) ENGINE=InnoDB;

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

CREATE TABLE IF NOT EXISTS system_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  setting_name VARCHAR(100) NOT NULL,
  setting_value VARCHAR(255) NOT NULL DEFAULT '',
  PRIMARY KEY (id),
  UNIQUE KEY uq_system_settings_name (setting_name)
) ENGINE=InnoDB;
