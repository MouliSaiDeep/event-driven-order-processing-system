const mysql = require("mysql2/promise");
const logger = require("./logger");

const pool = mysql.createPool({
  host: process.env.MYSQL_INVENTORY_HOST || "localhost",
  user: process.env.MYSQL_INVENTORY_USER || "root",
  password: process.env.MYSQL_ROOT_PASSWORD || "super_secure_root_password_123",
  database: process.env.MYSQL_INVENTORY_DB || "inventory_db",
  port: process.env.MYSQL_INVENTORY_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const checkDbConnection = async () => {
  try {
    const connection = await pool.getConnection();
    logger.info("Connected to inventory Database");
    connection.release();
  } catch (error) {
    logger.error("Failed to connect to inventory Database", error);
    process.exit(1);
  }
};

module.exports = { pool, checkDbConnection };
