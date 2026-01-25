require("dotenv").config();
const { connectProducer } = require("./producer");
const { connectConsumer } = require("./consumer");
const { checkDbConnection } = require("./database");
const logger = require("./logger");

const http = require("http");

const startService = async () => {
  logger.info("Starting Inventory Service...");

  await checkDbConnection();
  await connectProducer();
  await connectConsumer();

  // Create simple HTTP server for health checks
  const server = http.createServer((req, res) => {
    if (req.url === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "UP" }));
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
};

startService();
