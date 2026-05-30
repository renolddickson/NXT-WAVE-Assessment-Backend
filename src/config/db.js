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
  try {
    await sequelize.authenticate();
    console.log("PostgreSQL Database connected successfully.");
  } catch (error) {
    console.error("Unable to connect to the PostgreSQL database:", error.message);
    process.exit(1);
  }
};

module.exports = {
  sequelize,
  connectDB,
};
