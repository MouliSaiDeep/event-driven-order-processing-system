CREATE DATABASE IF NOT EXISTS order_status_db;
USE order_status_db;

CREATE TABLE IF NOT EXISTS orders_read_model (
    order_id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    items JSON NOT NULL,
    status VARCHAR(50) NOT NULL,
    inventory_status VARCHAR(50),
    payment_status VARCHAR(50),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    idempotency_key VARCHAR(255) UNIQUE NOT NULL
);