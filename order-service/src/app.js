require("dotenv").config();
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const Joi = require("joi");
const { publishEvent, connectProducer, disconnectProducer, producer } = require("./producer");
const logger = require("./logger");

const app = express();
app.use(express.json());

const orderSchema = Joi.object({
  user_id: Joi.string().required(),
  items: Joi.array()
    .items(
      Joi.object({
        product_id: Joi.string().required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .required(),
  idempotency_key: Joi.string().optional(),
});

// POST /api/orders
app.post("/api/orders", async (req, res) => {
  const { error, value } = orderSchema.validate(req.body);
  if (error) {
    logger.warn("Invalid order request", {
      error: error.details[0].message,
      request: req.body,
    });
    return res.status(400).json({
      error: error.details[0].message,
    });
  }

  const { user_id, items } = value;
  const idempotency_key = value.idempotency_key || uuidv4();
  const order_id = uuidv4();

  // Create a event
  const orderEvent = {
    event_type: "OrderCreated",
    order_id,
    user_id,
    items,
    total_amount: 0,
    status: "PENDING",
    timestamp: new Date().toISOString(),
    correlation_id: order_id,
    idempotency_key,
  };

  try {
    // Publish event
    await publishEvent("order-created", orderEvent);

    // Respond to client
    res.status(202).json({
      message: "Order accepted for processing",
      order_id,
      status: "PENDING",
      idempotency_key,
    });
  } catch (err) {
    logger.error("Failed to process order", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Health Check
app.get("/health", async (req, res) => {
  res.status(200).json({ status: "UP", dependencies: { kafka: "UP" } });
});
const PORT = process.env.PORT || 3000;
let server;

const startServer = async () => {
  await connectProducer();

  server = app.listen(PORT, () => {
    logger.info(`Order Service running on port ${PORT}`);
  });
};

const shutdown = async () => {
  logger.info("Shutting down Order Service gracefully...");
  if (server) {
    server.close(() => {
      logger.info("HTTP server closed.");
    });
  }
  await disconnectProducer();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

startServer();
