require("dotenv").config();
const { connectProducer } = require("./producer");
const { connectConsumer } = require("./consumer");
const { checkDbConnection } = require("./database");
const logger = require("./logger");

const startService = async () => {
  logger.info("Starting Inventory Service...");

  await checkDbConnection();
  await connectProducer();
  await connectConsumer();

  logger.info("Inventory Service started successfully");
};

startService();
