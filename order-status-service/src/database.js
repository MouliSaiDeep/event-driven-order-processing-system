const mysql = require("mysql2/promise");
const logger = require("./logger");

const pool = mysql.createPool({
  host: process.env.MYSQL_ORDERSTATUS_HOST || "localhost",
  user: process.env.MYSQL_ORDERSTATUS_USER || "root",
  password: process.env.MYSQL_ROOT_PASSWORD || "root",
  database: process.env.MYSQL_ORDERSTATUS_DB || "order_status_db",
  port: process.env.MYSQL_ORDERSTATUS_PORT || 3307,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const checkDbConnection = async () => {
  try {
    const connection = await pool.getConnection();
    logger.info("Connected to Order Status Database");
    connection.release();
  } catch (error) {
    logger.error("Order Status Database connection failed:", error);
    process.exit(1);
  }
};

module.exports = { pool, checkDbConnection };
