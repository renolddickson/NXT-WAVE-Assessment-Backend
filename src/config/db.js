const { Sequelize } = require("sequelize");

const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/task_tracker";

const sequelize = new Sequelize(dbUrl, {
  dialect: "postgres",
  logging: false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

const connectDB = async () => {
  const maxAttempts = Number(process.env.DB_CONNECT_RETRIES || 10);
  const retryDelayMs = Number(process.env.DB_CONNECT_RETRY_DELAY_MS || 3000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await sequelize.authenticate();
      console.log("PostgreSQL Database connected successfully.");
      return;
    } catch (error) {
      const hasAttemptsLeft = attempt < maxAttempts;
      console.error(
        `Unable to connect to PostgreSQL database (attempt ${attempt}/${maxAttempts}): ${error.message}`
      );

      if (!hasAttemptsLeft) {
        process.exit(1);
      }

      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
};

module.exports = {
  sequelize,
  connectDB,
};
