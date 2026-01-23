const { Kafka } = require("kafkajs");
const { publishEvent } = require("./producer");
const logger = require("./logger");

const kafka = new Kafka({
  clientId: "payment-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
});

const consumer = kafka.consumer({ groupId: "payment-group" });

const processPayment = async (orderEvent) => {
  const { order_id, user_id, idempotency_key, total_amount } = orderEvent;

  logger.info(`Processing payment for order ${order_id}...`);

  // Simulate processing time
  await new Promise((resolve) => setTimeout(resolve, 500));

  const isSuccess = Math.random() < 0.7;

  if (isSuccess) {
    logger.info(`Payment successful for order ${order_id}`);
    await publishEvent("payment-events", {
      event_type: "PaymentProcessed",
      order_id,
      status: "PROCESSED",
      timestamp: new Date().toISOString(),
      idempotency_key,
    });
  } else {
    logger.warn(`Payment failed for order ${order_id}`);
    await publishEvent("payment-events", {
      event_type: "PaymentFailed",
      order_id,
      status: "FAILED",
      reason: "Insufficient funds (Mock)",
      timestamp: new Date().toISOString(),
      idempotency_key,
    });
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
        });
        await processPayment(event);
      },
    });
    logger.info("Kafka Consumer connected and listening");
  } catch (error) {
    logger.error("Failed to connect Kafka Consumer:", error);
    process.exit(1);
  }
};

module.exports = { connectConsumer };
