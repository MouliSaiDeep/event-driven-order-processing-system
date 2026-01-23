require("dotenv").config();
const { connectProducer } = require("./producer");
const { connectConsumer } = require("./consumer");
const logger = require("./logger");

const startService = async () => {
  logger.info("Starting Payment Service...");

  await connectProducer();
  await connectConsumer();

  logger.info("Payment Service started successfully.");
};

startService();
