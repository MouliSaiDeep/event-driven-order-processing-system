const { Kafka } = require("kafkajs");
const { pool } = require("./database");
const logger = require("./logger");

const kafka = new Kafka({
  clientId: "order-status-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "order-status-group" });

const handleOrderCreated = async (event) => {
  const { order_id, user_id, items, idempotency_key } = event;
  try {
    await pool.execute(
      `INSERT INTO orders_read_model 
       (order_id, user_id, items, status, inventory_status, payment_status, idempotency_key) 
       VALUES (?, ?, ?, 'PENDING', 'PENDING', 'PENDING', ?)`,
      [order_id, user_id, JSON.stringify(items), idempotency_key],
    );
    logger.info(`Order ${order_id} created in read model`);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      logger.warn(`Duplicate order creation skipped: ${order_id}`);
    } else {
      logger.error(`Failed to handle OrderCreated: ${error.message}`);
    }
  }
};

const handleInventoryEvent = async (event) => {
  const { order_id, status } = event;
  // status is 'RESERVED' or 'FAILED' from inventory service

  const inventoryStatus = status === "RESERVED" ? "RESERVED" : "FAILED";
  const globalStatus = status === "RESERVED" ? null : "FAILED"; // If inventory fails, order fails

  try {
    let query = "UPDATE orders_read_model SET inventory_status = ?";
    const params = [inventoryStatus];

    if (globalStatus) {
      query += ", status = ?";
      params.push(globalStatus);
    }

    query += " WHERE order_id = ?";
    params.push(order_id);

    await pool.execute(query, params);
    logger.info(
      `Updated inventory status for ${order_id} to ${inventoryStatus}`,
    );
    await checkCompletion(order_id);
  } catch (error) {
    logger.error(`Failed to handle InventoryEvent: ${error.message}`);
  }
};

const handlePaymentEvent = async (event) => {
  const { order_id, status } = event;
  // status is 'PROCESSED' or 'FAILED' from payment service

  const paymentStatus = status === "PROCESSED" ? "PAID" : "FAILED";
  const globalStatus = status === "PROCESSED" ? null : "FAILED"; // If payment fails, order fails

  try {
    let query = "UPDATE orders_read_model SET payment_status = ?";
    const params = [paymentStatus];

    if (globalStatus) {
      query += ", status = ?";
      params.push(globalStatus);
    }

    query += " WHERE order_id = ?";
    params.push(order_id);

    await pool.execute(query, params);
    logger.info(`Updated payment status for ${order_id} to ${paymentStatus}`);
    await checkCompletion(order_id);
  } catch (error) {
    logger.error(`Failed to handle PaymentEvent: ${error.message}`);
  }
};

const checkCompletion = async (order_id) => {
  try {
    const [rows] = await pool.execute(
      "SELECT inventory_status, payment_status, status FROM orders_read_model WHERE order_id = ?",
      [order_id],
    );

    if (rows.length === 0) return;

    const { inventory_status, payment_status, status } = rows[0];

    if (
      status === "PENDING" &&
      inventory_status === "RESERVED" &&
      payment_status === "PAID"
    ) {
      await pool.execute(
        "UPDATE orders_read_model SET status = ? WHERE order_id = ?",
        ["COMPLETED", order_id],
      );
      logger.info(`Order ${order_id} marked as COMPLETED`);
    }
  } catch (error) {
    logger.error(
      `Failed to check completion for ${order_id}: ${error.message}`,
    );
  }
};

const connectConsumer = async () => {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: "order-created", fromBeginning: true });
    await consumer.subscribe({
      topic: "inventory-events",
      fromBeginning: true,
    });
    await consumer.subscribe({ topic: "payment-events", fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = JSON.parse(message.value.toString());
        logger.info(`Received ${topic} event`, { order_id: event.order_id });

        switch (topic) {
          case "order-created":
            await handleOrderCreated(event);
            break;
          case "inventory-events":
            await handleInventoryEvent(event);
            break;
          case "payment-events":
            await handlePaymentEvent(event);
            break;
        }
      },
    });
    logger.info("Kafka Consumer connected and listening");
  } catch (error) {
    logger.error("Failed to connect Kafka Consumer:", error);
    process.exit(1);
  }
};

module.exports = { connectConsumer };
