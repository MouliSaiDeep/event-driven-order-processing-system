# Event-Driven Order Processing System

A distributed e-commerce system built with **Node.js** microservices, **Kafka** for event streaming, and **MySQL** for persistence.

## 🏗 Architecture

The system consists of 4 decoupled microservices:

1.  **Order Service** (Port `3000`)
    - **Role**: Accepts HTTP requests for new orders.
    - **Action**: Validates input and publishes `OrderCreated` events to Kafka.
    - **Stack**: Express.js, KafkaJS.

2.  **Inventory Service** (Background Worker)
    - **Role**: Manages product stock.
    - **Action**: Consumes `OrderCreated`. Checks database. Publishes `InventoryReserved` or `InventoryFailed`.
    - **Stack**: Node.js, MySQL2, KafkaJS.
    - **Feature**: Implements **Idempotency** (deduplication) using a `processed_events` table.

3.  **Payment Service** (Background Worker)
    - **Role**: Processes payments.
    - **Action**: Consumes `OrderCreated`. Mocks payment logic (70% success rate). Publishes `PaymentProcessed`.
    - **Stack**: Node.js, KafkaJS.

4.  **Order Status Service** (Port `3001`)
    - **Role**: Tracks the lifecycle of an order.
    - **Action**: Consumes ALL events (`OrderCreated`, `InventoryReserved`, `PaymentProcessed`, etc.) to update a unified "Read Model" database.
    - **Stack**: Express.js, MySQL2, KafkaJS.

---

## 🚀 Prerequisites

- **Docker & Docker Compose** (for Kafka, Zookeeper, MySQL)
- **Node.js** (v18 or higher)
- **Python 3** (for running the automated test suite)

---

## 🛠️ Setup & Installation

### 1. Start Infrastructure

Start the supporting services (Kafka, Zookeeper, MySQL databases) using Docker.

```bash
docker-compose --env-file .env up -d
```

> **Note**: This uses the root `.env` file for docker configuration.

### 2. Configure Microservices

Each service has its own `.env` file for configuration. We have provided examples.

```bash
# Order Service
cp order-service/.env.example order-service/.env

# Inventory Service
cp inventory-service/.env.example inventory-service/.env

# Payment Service
cp payment-service/.env.example payment-service/.env

# Order Status Service
cp order-status-service/.env.example order-status-service/.env
```

### 3. Install Dependencies & Run

You need to run each service in a **separate terminal**.

**Terminal 1: Order Service**

```bash
cd order-service
npm install
npm run dev
# Running on http://localhost:3000
```

**Terminal 2: Inventory Service**

```bash
cd inventory-service
npm install
npm run dev
```

**Terminal 3: Payment Service**

```bash
cd payment-service
npm install
npm run dev
```

**Terminal 4: Order Status Service**

```bash
cd order-status-service
npm install
npm run dev
# Running on http://localhost:3001
```

---

## 🧪 Testing

### Automated End-to-End Tests

We have a Python test suite that verifies the entire flow (Happy Path & Failure Path).

1.  **Install Test Dependencies**:

    ```bash
    cd tests
    # Create virtual environment (optional but recommended)
    python -m venv .venv
    ./.venv/Scripts/Activate  # Windows
    # source .venv/bin/activate # Mac/Linux

    pip install -r requirements.txt
    ```

2.  **Run Tests**:
    ```bash
    pytest -v
    ```

### Manual Testing (cURL)

You can manually trigger an order:

```bash
curl -X POST http://localhost:3005/api/orders \
  -H "Content-Type: application/json" \
  -d '{"user_id": "test-user", "items": [{"product_id": "prod-001", "quantity": 1}]}'
```

Check status:

```bash
# Replace with the order_id returned from the previous command
curl http://localhost:3001/api/orders/<ORDER_ID>
```

---

## ⚠️ Troubleshooting

**1. "Insufficient Stock" Error in Tests**
If the database was reset or volumes were lost, the product data might be missing.
**Fix**: Reset usage data by wiping volumes and restarting.

```bash
docker-compose down -v
docker-compose --env-file .env up -d
```

(The `init.sql` script will automatically re-seed `prod-001` into the database).

**2. "Access Denied" or Connection Errors**
Ensure `docker-compose` is running. Check that each service's `.env` file has the correct `MYSQL_HOST`, `USER`, and `PASSWORD` (default: `root` / `super_secure_root_password_123`).
