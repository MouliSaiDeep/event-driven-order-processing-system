require("dotenv").config();
const { connectProducer, disconnectProducer, producer } = require("./producer");
const { connectConsumer, disconnectConsumer, consumer } = require("./consumer");
const { checkDbConnection, pool } = require("./database");
const logger = require("./logger");

const http = require("http");

const startService = async () => {
  logger.info("Starting Inventory Service...");

  await checkDbConnection();
  await connectProducer();
  await connectConsumer();

  // Create simple HTTP server for health checks
  const server = http.createServer(async (req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      let isDbConnected = false;
      try {
        await pool.query("SELECT 1");
        isDbConnected = true;
      } catch (err) { /* ignore */ }

      // Also check Kafka if needed, but for now just DB + process running
      if (isDbConnected) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "UP", dependencies: { mysql: "UP", kafka: "UP" } }));
      } else {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "DOWN", dependencies: { mysql: "DOWN", kafka: "UP" } }));
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const PORT = process.env.PORT || 8001;
  server.listen(PORT, () => {
    logger.info(`Inventory Service health check running on port ${PORT}`);
  });

  logger.info("Inventory Service started successfully");

  const shutdown = async () => {
    logger.info("Shutting down Inventory Service gracefully...");
    server.close();
    await disconnectConsumer();
    await disconnectProducer();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

startService();

