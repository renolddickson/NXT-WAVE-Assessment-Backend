const { Sequelize } = require("sequelize");
require("dotenv").config();

const createDatabase = async () => {
  const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/task_tracker";
  
  // Strip out target database name and connect to default administrative 'postgres' database
  const adminUrl = url.replace(/\/task_tracker$/, "/postgres").replace(/\/$/, "/postgres");

  console.log(`Connecting to admin database at ${adminUrl}...`);
  const sequelize = new Sequelize(adminUrl, {
    dialect: "postgres",
    logging: false,
  });

  try {
    await sequelize.authenticate();
    console.log("Admin connection established. Creating database 'task_tracker'...");
    
    await sequelize.query("CREATE DATABASE task_tracker;");
    console.log("Database 'task_tracker' created successfully.");
  } catch (error) {
    // 42P04 is the PostgreSQL error code for duplicate_database
    if (error.original && error.original.code === "42P04") {
      console.log("Database 'task_tracker' already exists.");
    } else {
      console.error("Failed to create database:", error.message);
    }
  } finally {
    await sequelize.close();
    process.exit(0);
  }
};

createDatabase();
