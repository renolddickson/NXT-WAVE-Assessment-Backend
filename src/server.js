require("dotenv").config();

const app = require("./app");
const { connectDB, sequelize } = require("./config/db");
const { connectRedis } = require("./config/redis");

require("./models/associations");

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  await connectRedis();

  console.log("Synchronizing PostgreSQL tables...");
  await sequelize.sync({ alter: true });
  console.log("PostgreSQL schemas synchronized successfully.");

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Critical server failure:", error);
  process.exit(1);
});
