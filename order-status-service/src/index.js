require("dotenv").config();
const app = require("./app");
const { checkDbConnection, pool } = require("./database");
const { connectConsumer, disconnectConsumer, consumer } = require("./consumer");
const logger = require("./logger");

const PORT = 3001; // Port 3000 is taken by Order Service

const startService = async () => {
  logger.info("Starting Order Status Service...");

  await checkDbConnection();
  await connectConsumer();

  const server = app.listen(PORT, () => {
    logger.info(`Order Status Service API running on port ${PORT}`);
  });

  const shutdown = async () => {
    logger.info("Shutting down Order Status Service gracefully...");
    server.close();
    await disconnectConsumer();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

startService();

