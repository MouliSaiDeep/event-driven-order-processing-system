const { Kafka } = require("kafkajs");
const logger = require("./logger");

const kafka = new Kafka({
  clientId: "inventory-service",
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
    logger.info("Connected to Kafka Producer");
  } catch (error) {
    logger.info("Failed to connect to Kafka Producer", error);
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
    logger.info(`Event published to ${topic}`, {
      order_id: event.order_id,
      status: event.status,
    });
  } catch (error) {
    logger.error(`Failed to publish event to ${topic}: `, error);
  }
};

module.exports = { connectProducer, publishEvent };
