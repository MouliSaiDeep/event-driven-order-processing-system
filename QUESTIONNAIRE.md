# Questionnaire Responses

## 1) Architecture and Event Flow

This project uses an event-driven microservices architecture with Apache Kafka as the message backbone.

The flow is:

1. Order Service accepts POST /api/orders and publishes OrderCreated.
2. Inventory Service and Payment Service consume OrderCreated independently.
3. Inventory publishes InventoryReserved or InventoryFailed.
4. Payment publishes PaymentProcessed or PaymentFailed.
5. Order Status Service consumes all events and updates a read model table for GET /api/orders/:order_id.

This design keeps services loosely coupled and allows each service to scale independently.

## 2) Idempotency Strategy

Idempotency is implemented in Inventory and Payment consumers with a processed_events table.

For each OrderCreated event:

1. Start a database transaction.
2. Check processed_events for idempotency_key with FOR UPDATE lock.
3. If present, skip processing and rollback.
4. If absent, execute business logic and insert idempotency_key into processed_events.
5. Commit transaction.

Order Status uses a UNIQUE constraint on idempotency_key in orders_read_model to ignore duplicate OrderCreated inserts.

## 3) Error Handling and Resilience

Resilience mechanisms include:

1. Producer retries configured in Kafka clients for transient broker/network failures.
2. Transaction-based inventory and payment processing to avoid partial writes.
3. Structured error logging with order and correlation context.
4. Service health endpoints and Docker healthchecks for readiness/startup ordering.
5. Graceful shutdown handlers (SIGTERM/SIGINT) to disconnect Kafka clients and close DB pools.

## 4) Observability and Tracing

All services use structured JSON logs. Correlation IDs are propagated from OrderCreated into downstream events and logs so a single order can be traced across services.

Key logged events:

1. Event consumed.
2. Event published.
3. Database updates.
4. Processing failures.

## 5) Tradeoffs and Improvement Plan

Current tradeoffs:

1. At-least-once delivery semantics with idempotent consumers (simple and robust for this scope).
2. Read-model projection favors query performance over strict synchronous consistency.

Planned improvements:

1. Add Dead-Letter Topics for poison messages.
2. Add explicit consumer-side retry/backoff wrappers around message processing paths.
3. Add metrics and distributed tracing (Prometheus + OpenTelemetry).
4. Add contract/schema validation for events (for example with JSON Schema).
5. Add integration tests for replays and out-of-order event delivery.

## 6) How Failures Are Handled

Inventory failure path:

1. Inventory detects insufficient stock and emits InventoryFailed.
2. Order Status marks inventory_status=FAILED and status=FAILED.

Payment failure path:

1. Payment service emits PaymentFailed.
2. Order Status marks payment_status=FAILED and status=FAILED.

Because inventory and payment process asynchronously, one branch can fail while the other succeeds; the global order status remains FAILED.

## 7) Why Kafka Topics Are Split

Topics are split by responsibility:

1. order-created: command-like domain trigger consumed by multiple services.
2. inventory-events: inventory outcomes for projection and audit.
3. payment-events: payment outcomes for projection and audit.

This keeps event streams clear, enables independent consumer groups, and simplifies evolution of each domain.

## 8) Production Readiness Notes

This project is ready for local and staging validation. Before production deployment, recommended additions are:

1. Secrets manager integration for credentials.
2. TLS/SASL for Kafka.
3. Database migrations with versioning.
4. Horizontal autoscaling and partition planning.
5. Alerting on consumer lag and failed event rates.
