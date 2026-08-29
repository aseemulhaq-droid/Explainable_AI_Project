CREATE DATABASE IF NOT EXISTS explainable_ai_medical;
USE explainable_ai_medical;

DROP TABLE IF EXISTS lime_scores;
DROP TABLE IF EXISTS feature_inputs;
DROP TABLE IF EXISTS diagnoses;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS login_history;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('doctor', 'admin', 'researcher') NOT NULL,
    account_status ENUM('approved', 'suspended', 'revoked') NOT NULL DEFAULT 'approved',
    institution VARCHAR(150) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_history (
    login_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    email VARCHAR(150) NOT NULL,
    role VARCHAR(20) DEFAULT NULL,
    successful TINYINT(1) NOT NULL DEFAULT 0,
    ip_address VARCHAR(45) DEFAULT NULL,
    logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE patients (
    patient_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender ENUM('male', 'female') NOT NULL,
    created_by INT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE diagnoses (
    diagnosis_id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    disease_type ENUM('diabetes', 'heart', 'cancer', 'liver') NOT NULL,
    result ENUM('DETECTED', 'NOT_DETECTED') NOT NULL,
    confidence FLOAT NOT NULL,
    risk_level ENUM('RED', 'YELLOW', 'GREEN') NOT NULL,
    diagnosed_by INT NOT NULL,
    diagnosed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id) ON DELETE CASCADE,
    FOREIGN KEY (diagnosed_by) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE feature_inputs (
    input_id INT AUTO_INCREMENT PRIMARY KEY,
    diagnosis_id INT NOT NULL,
    feature_name VARCHAR(50) NOT NULL,
    feature_value FLOAT NOT NULL,
    risk_flag ENUM('RED', 'YELLOW', 'GREEN') DEFAULT NULL,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(diagnosis_id) ON DELETE CASCADE
);

CREATE TABLE lime_scores (
    lime_id INT AUTO_INCREMENT PRIMARY KEY,
    diagnosis_id INT NOT NULL,
    feature_name VARCHAR(50) NOT NULL,
    importance_score FLOAT NOT NULL,
    rank_order INT DEFAULT NULL,
    FOREIGN KEY (diagnosis_id) REFERENCES diagnoses(diagnosis_id) ON DELETE CASCADE
);
