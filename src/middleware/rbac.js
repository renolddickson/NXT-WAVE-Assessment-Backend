const { ForbiddenError, NotFoundError } = require("../utils/errors");
const Task = require("../models/Task");

const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ForbiddenError("User context not available"));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access denied. Requires one of: ${allowedRoles.join(", ")}`));
    }

    next();
  };
};

const checkTaskAccess = async (req, res, next) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      return next(new NotFoundError("Task ID not provided"));
    }

    const task = await Task.findByPk(taskId);
    if (!task) {
      throw new NotFoundError("Task not found");
    }

    if (task.organizationId !== req.user.organizationId) {
      throw new NotFoundError("Task not found");
    }

    if (req.user.role === "MEMBER" && task.assignee !== req.user.id) {
      throw new ForbiddenError("You can only access tasks assigned to you");
    }

    req.task = task;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  requireRole,
  checkTaskAccess,
};
