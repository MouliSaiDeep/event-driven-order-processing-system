require("dotenv").config();
const app = require("./app");
const { checkDbConnection } = require("./database");
const { connectConsumer } = require("./consumer");
const logger = require("./logger");

const PORT = 3001; // Port 3000 is taken by Order Service

const startService = async () => {
  logger.info("Starting Order Status Service...");

  await checkDbConnection();
  await connectConsumer();

  app.listen(PORT, () => {
    logger.info(`Order Status Service API running on port ${PORT}`);
  });
};

startService();
