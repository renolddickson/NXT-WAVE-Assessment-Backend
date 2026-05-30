const { ForbiddenError, NotFoundError } = require("../utils/errors");
const Task = require("../models/Task");

/**
 * Enforces general role boundaries at the middleware level.
 * @param {string[]} allowedRoles - List of roles permitted to access this route
 */
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

/**
 * Task-level authorization middleware adapted for PostgreSQL (Sequelize).
 * Ensures the task exists, belongs to the user's organization, and
 * enforces MEMBER role limitations. Attaches the fetched task to `req.task`.
 */
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

    // Multi-tenant check: ensure task belongs to the user's organization
    if (task.organizationId !== req.user.organizationId) {
      throw new NotFoundError("Task not found"); // Masking existence for security
    }

    // Role-based check: MEMBER can only access tasks assigned to them
    if (req.user.role === "MEMBER" && task.assignee !== req.user.id) {
      throw new ForbiddenError("You can only access tasks assigned to you");
    }

    // Attach task to request context
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
