const { Kafka } = require("kafkajs");
const { pool } = require("./database");
const { publishEvent } = require("./producer");
const logger = require("./logger");

const kafka = new Kafka({
  clientId: "inventory-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "inventory-group" });

const processOrder = async (orderEvent) => {
  const { order_id, items, idempotency_key, correlation_id } = orderEvent;
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

    // Check availability for all items
    for (const item of items) {
      const [rows] = await connection.execute(
        "SELECT stock_level FROM products WHERE product_id = ? FOR UPDATE",
        [item.product_id],
      );

      if (rows.length === 0 || rows[0].stock_level < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.product_id}`);
      }
    }

    // Decrement stock
    for (const item of items) {
      await connection.execute(
        "UPDATE products SET stock_level = stock_level - ? WHERE product_id = ?",
        [item.quantity, item.product_id],
      );
    }

    // Mark event as processed
    await connection.execute(
      "INSERT INTO processed_events (event_id) VALUES (?)",
      [idempotency_key],
    );

    await connection.commit();
    logger.info(`Stock reserved for order ${order_id}`, { correlation_id });

    // Publish Success Event
    await publishEvent("inventory-events", {
      event_type: "InventoryReserved",
      order_id,
      status: "RESERVED",
      timestamp: new Date().toISOString(),
      idempotency_key,
      correlation_id,
    });
  } catch (error) {
    await connection.rollback();
    logger.error(
      `Failed to reserve stock for order ${order_id}: ${error.message}`,
      { correlation_id }
    );

    // Publish Failure Event
    await publishEvent("inventory-events", {
      event_type: "InventoryFailed",
      order_id,
      status: "FAILED",
      reason: error.message,
      timestamp: new Date().toISOString(),
      idempotency_key,
      correlation_id,
    });
  } finally {
    connection.release();
  }
};

const connectConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: "order-created", fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = JSON.parse(message.value.toString());
        logger.info(`Received order-created event`, {
          order_id: event.order_id,
          correlation_id: event.correlation_id,
        });
        await processOrder(event);
      },
    });
    logger.info("Kafka Consumer connected and listening");
  } catch (error) {
    logger.error("Failed to connect Kafka Consumer:", error);
    process.exit(1);
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
