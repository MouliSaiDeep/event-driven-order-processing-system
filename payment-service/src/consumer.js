const { Kafka } = require("kafkajs");
const { pool } = require("./database");
const { publishEvent } = require("./producer");
const logger = require("./logger");
const kafka = new Kafka({
  clientId: "payment-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "payment-group" });

const MAX_STARTUP_RETRIES = Number(process.env.KAFKA_STARTUP_RETRIES || 8);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableStartupError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    Boolean(error?.retriable) ||
    message.includes("does not host this topic-partition") ||
    message.includes("unknown topic or partition") ||
    message.includes("leader not available")
  );
};

const ensureOrderTopicExists = async () => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: "order-created",
          numPartitions: 1,
          replicationFactor: 1,
        },
      ],
    });
  } finally {
    await admin.disconnect();
  }
};

const processPayment = async (orderEvent) => {
  const { order_id, user_id, idempotency_key, total_amount, correlation_id } = orderEvent;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --- IDEMPOTENCY CHECK START ---
    const [existingEvents] = await connection.execute(
      "SELECT event_id FROM processed_events WHERE event_id = ? FOR UPDATE",
      [idempotency_key],
    );

    if (existingEvents.length > 0) {
      logger.info(
        `Skipping duplicate event ${idempotency_key} for order ${order_id}`,
        { correlation_id }
      );
      await connection.rollback();
      return;
    }
    // --- IDEMPOTENCY CHECK END ---

    logger.info(`Processing payment for order ${order_id}...`, { correlation_id });

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Deterministic mock for testing
    let isSuccess;
    if (user_id && user_id.startsWith("test-user")) {
      isSuccess = true;
    } else if (user_id === "fail-user") {
      isSuccess = false;
    } else {
      isSuccess = Math.random() < 0.7;
    }

    if (isSuccess) {
      logger.info(`Payment successful for order ${order_id}`, { correlation_id });
      await publishEvent("payment-events", {
        event_type: "PaymentProcessed",
        order_id,
        status: "PROCESSED",
        timestamp: new Date().toISOString(),
        idempotency_key,
        correlation_id,
      });
    } else {
      logger.warn(`Payment failed for order ${order_id}`, { correlation_id });
      await publishEvent("payment-events", {
        event_type: "PaymentFailed",
        order_id,
        status: "FAILED",
        reason: "Insufficient funds (Mock)",
        timestamp: new Date().toISOString(),
        idempotency_key,
        correlation_id,
      });
    }

    // Mark event as processed
    await connection.execute(
      "INSERT INTO processed_events (event_id) VALUES (?)",
      [idempotency_key],
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    logger.error(
      `Failed to process payment for order ${order_id}: ${error.message}`,
      { correlation_id }
    );
  } finally {
    connection.release();
  }
};

const connectConsumer = async () => {
  for (let attempt = 1; attempt <= MAX_STARTUP_RETRIES; attempt += 1) {
    try {
      await ensureOrderTopicExists();
      await consumer.connect();
      await consumer.subscribe({ topic: "order-created", fromBeginning: true });

      await consumer.run({
        eachMessage: async ({ message }) => {
          const event = JSON.parse(message.value.toString());
          logger.info(`Received order-created event`, {
            order_id: event.order_id,
          });
          await processPayment(event);
        },
      });
      logger.info("Kafka Consumer connected and listening");
      return;
    } catch (error) {
      const retryable = isRetryableStartupError(error);
      logger.error(
        `Failed to connect Kafka Consumer (attempt ${attempt}/${MAX_STARTUP_RETRIES})`,
        error,
      );

      try {
        await consumer.disconnect();
      } catch (disconnectError) {
        logger.warn("Consumer disconnect after failed startup attempt was not clean", {
          reason: disconnectError.message,
        });
      }

      if (!retryable || attempt === MAX_STARTUP_RETRIES) {
        process.exit(1);
      }

      await wait(1000 * attempt);
    }
  }
};

const disconnectConsumer = async () => {
  try {
    await consumer.disconnect();
    logger.info("Disconnected from Kafka Consumer");
  } catch (error) {
    logger.error("Failed to disconnect Kafka Consumer:", error);
  }
};

module.exports = { connectConsumer, disconnectConsumer, consumer };
