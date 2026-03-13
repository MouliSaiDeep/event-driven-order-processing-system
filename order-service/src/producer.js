const { Kafka } = require("kafkajs");
const logger = require("./logger");

const kafka = new Kafka({
  clientId: "order-service",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
});

const producer = kafka.producer();

const connectProducer = async () => {
  try {
    await producer.connect();
    logger.info("Connected to the Kafka Producer");
  } catch (error) {
    logger.error("Failed to connect to Kafka: ", error);
    process.exit(1);
  }
};

const publishEvent = async (topic, event) => {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: event.order_id,
          value: JSON.stringify(event),
        },
      ],
    });
    logger.info(`Event published to ${topic}`, { order_id: event.order_id });
  } catch (error) {
    logger.error(`Failed to publish event to ${topic}:`, error);
    throw error;
  }
};

const disconnectProducer = async () => {
  try {
    await producer.disconnect();
    logger.info("Disconnected from the Kafka Producer");
  } catch (error) {
    logger.error("Failed to disconnect from Kafka Producer: ", error);
  }
};

module.exports = {
  connectProducer,
  disconnectProducer,
  publishEvent,
  producer,
};
