const express = require("express");
const { pool } = require("./database");
const logger = require("./logger");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// Health Check
app.get("/health", async (req, res) => {
  let isDbConnected = false;
  try {
    await pool.query("SELECT 1");
    isDbConnected = true;
  } catch (err) { /* ignore */ }

  if (isDbConnected) {
    res.status(200).json({ status: "UP", dependencies: { mysql: "UP", kafka: "UP" } });
  } else {
    res.status(503).json({ status: "DOWN", dependencies: { mysql: "DOWN", kafka: "UP" } });
  }
});

// Get Order Status
app.get("/api/orders/:orderId", async (req, res) => {
  const { orderId } = req.params;
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM orders_read_model WHERE order_id = ?",
      [orderId],
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    logger.error(`Failed to fetch order ${orderId}:`, error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

module.exports = app;
