const mysql = require("mysql2/promise");
const logger = require("./logger");

const pool = mysql.createPool({
  host: process.env.MYSQL_PAYMENT_HOST || "localhost",
  port: process.env.MYSQL_PAYMENT_PORT || 3306,
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "root_password",
  database: process.env.MYSQL_PAYMENT_DB || "payment_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

pool
  .getConnection()
  .then((connection) => {
    logger.info("Connected to Payment MySQL Database successfully.");
    connection.release();
  })
  .catch((err) => {
    logger.error("Failed to connect to Payment MySQL database", err);
  });

module.exports = { pool };
