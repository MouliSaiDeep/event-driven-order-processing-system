CREATE DATABASE IF NOT EXISTS inventory_db;
USE inventory_db;

CREATE TABLE IF NOT EXISTS products (
    product_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    stock_level INT NOT NULL DEFAULT 0,
    price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_events (
    event_id VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- Seed initial data
INSERT INTO products (product_id, name, description, stock_level, price)
('prod-001', 'Laptop Pro', 'High-performance laptop', 50, 1200.00),
('prod-002', 'Mechanical Keyboard', 'Gaming keyboard', 100, 150.00),
('prod-003', 'Wireless Mouse', 'Ergonomic wireless mouse', 75, 50.00),
('prod-004', 'Webcam 1080p', 'Full HD webcam', 30, 75.00),
('prod-005', 'Monitor 27-inch', 'QHD monitor', 20, 300.00)
ON DUPLICATE KEY UPDATE stock_level = VALUES(stock_level);