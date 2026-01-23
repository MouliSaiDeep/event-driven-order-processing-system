const { Kafka } = require("kafkajs");
const pool = require("./database");
const { publishEvent } = require("./producer");
const logger = require("./logger");

const kafka = new Kafka({
  clientId: "inventory-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "inventory-group" });

const processOrder = async (orderEvent) => {
  const { order_id, items, idempotency_key } = orderEvent;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

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
      const [rows] = connection.execute(
        "UPDATE products SET stock_level = stock_level - ? WHERE product_id = ?",
        [item.quantity, item.product_id],
      );
    }

    await connection.commit();
    logger.info(`Stock reserved for order ${order_id}`);

    // Publish Success Event
    await publishEvent("inventory-events", {
      event_type: "InventoryReserved",
      order_id,
      status: "RESERVED",
      timestamp: new Date().toISOString(),
      idempotency_key,
    });
  } catch (error) {
    await connection.rollback();
    logger.error(
      `Failed to reserve stock for order ${order_id}: ${error.message}`,
    );

    // Publish a Failure Event
    await publishEvent("inventory-events", {
      event_type: "InventoryFailed",
      order_id,
      status: "FAILED",
      reason: error.message,
      timestamp: new Date().toISOString(),
      idempotency_key,
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
        logger.info("Received order-created event", {
          order_id: event.order_id,
        });
        await processOrder(event);
      },
    });
    logger.info("Kafka Consumer connected and listening");
  } catch (error) {
    logger.error("Failed to connect Kafka Consumer", error);
    process.exit(1);
  }
};

module.exports = { connectConsumer };
