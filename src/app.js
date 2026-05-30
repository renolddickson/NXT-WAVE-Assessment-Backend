const express = require("express");
const cors = require("cors");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");
const projectsRouter = require("./routes/projects");
const tasksRouter = require("./routes/tasks");
const errorHandler = require("./middleware/errorHandler");
const { NotFoundError } = require("./utils/errors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);

app.use((req, res, next) => {
  next(new NotFoundError("Route not found"));
});

app.use(errorHandler);

module.exports = app;