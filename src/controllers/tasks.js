const Task = require("../models/Task");
const User = require("../models/User");
const Project = require("../models/Project");
const { getCache, setCache, invalidateCachePattern } = require("../config/redis");
const { NotFoundError, ValidationError, ForbiddenError } = require("../utils/errors");

// Strict transition validation matrix
const ALLOWED_TRANSITIONS = {
  TODO: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED"],
  IN_REVIEW: ["DONE", "BLOCKED"],
  BLOCKED: ["TODO", "IN_PROGRESS", "IN_REVIEW"],
  DONE: [], // Terminal state, cannot transition out of DONE
};

/**
 * Invalidation helper to clear Redis cache for a specific assignee
 */
const clearAssigneeCache = async (assigneeId) => {
  if (!assigneeId) return;
  const pattern = `tasks:assignee:${assigneeId.toString()}:*`;
  await invalidateCachePattern(pattern);
};

const getTasks = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, priority, assignee } = req.query;

    // Build query scoped to organization
    const where = { organizationId: req.user.organizationId };

    // Apply role-based filtering: MEMBER can only see tasks assigned to them
    let targetAssignee = assignee;
    if (req.user.role === "MEMBER") {
      targetAssignee = req.user.id.toString();
    }

    if (targetAssignee) {
      where.assignee = targetAssignee;
    }
    if (status) {
      where.status = status;
    }
    if (priority) {
      where.priority = priority;
    }

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offsetNum = (pageNum - 1) * limitNum;

    // Caching Strategy: Cache queries that filter by assignee
    let cacheKey = null;
    if (targetAssignee) {
      cacheKey = `tasks:assignee:${targetAssignee}:page:${pageNum}:limit:${limitNum}:status:${status || "any"}:priority:${priority || "any"}`;
      const cachedData = await getCache(cacheKey);
      if (cachedData) {
        console.log(`Cache Hit for key: ${cacheKey}`);
        return res.status(200).json(cachedData);
      }
      console.log(`Cache Miss for key: ${cacheKey}`);
    }

    // DB Fetch
    const { rows: tasks, count: total } = await Task.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "assigneeUser",
          attributes: ["id", "name", "email", "role"],
        },
        {
          model: Project,
          attributes: ["id", "name"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset: offsetNum,
    });

    const result = {
      tasks,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };

    // Cache the result if applicable
    if (cacheKey) {
      await setCache(cacheKey, result, 1800); // 30 minutes TTL
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const createTask = async (req, res, next) => {
  try {
    const { title, description, priority, assignee, projectId, due_date } = req.body;

    // Validate assignee belongs to the same organization
    const assigneeUser = await User.findOne({
      where: { id: assignee, organizationId: req.user.organizationId },
    });
    if (!assigneeUser) {
      throw new ValidationError("Assignee must be a user in the same organization");
    }

    // Validate project belongs to the same organization (if provided)
    if (projectId) {
      const project = await Project.findOne({
        where: { id: projectId, organizationId: req.user.organizationId },
      });
      if (!project) {
        throw new ValidationError("Project must belong to the same organization");
      }
    }

    const task = await Task.create({
      title,
      description,
      priority,
      status: "TODO",
      assignee,
      projectId: projectId || null,
      organizationId: req.user.organizationId,
      due_date,
    });

    // Active Cache Invalidation
    await clearAssigneeCache(assignee);

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const task = req.task; // Injected by checkTaskAccess middleware
    const { title, description, priority, assignee, projectId, due_date } = req.body;

    const oldAssignee = task.assignee.toString();
    let newAssignee = oldAssignee;

    if (assignee && assignee.toString() !== oldAssignee) {
      const assigneeUser = await User.findOne({
        where: { id: assignee, organizationId: req.user.organizationId },
      });
      if (!assigneeUser) {
        throw new ValidationError("Assignee must be a user in the same organization");
      }
      newAssignee = assignee.toString();
      task.assignee = assignee;
    }

    if (projectId) {
      const project = await Project.findOne({
        where: { id: projectId, organizationId: req.user.organizationId },
      });
      if (!project) {
        throw new ValidationError("Project must belong to the same organization");
      }
      task.projectId = projectId;
    } else if (projectId === null || projectId === "") {
      task.projectId = null;
    }

    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority !== undefined) task.priority = priority;
    if (due_date !== undefined) task.due_date = due_date;

    await task.save();

    // Active Cache Invalidation
    await clearAssigneeCache(oldAssignee);
    if (oldAssignee !== newAssignee) {
      await clearAssigneeCache(newAssignee);
    }

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

const advanceTaskStatus = async (req, res, next) => {
  try {
    const task = req.task; // Injected by checkTaskAccess
    const { status } = req.body;

    const currentStatus = task.status;

    // 1. Enforce status transition sequences
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${status}. Allowed: ${allowedNext.join(", ") || "None"}`
      );
    }

    // 2. Validate permission: Only assignee, MANAGER, or ADMIN can advance status
    const isAssignee = task.assignee.toString() === req.user.id.toString();
    const isManagerOrAdmin = ["MANAGER", "ADMIN"].includes(req.user.role);
    if (!isAssignee && !isManagerOrAdmin) {
      throw new ForbiddenError("Only the assignee or a MANAGER/ADMIN can advance a task's status");
    }

    task.status = status;
    await task.save();

    // Active Cache Invalidation
    await clearAssigneeCache(task.assignee);

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const task = req.task; // Injected by checkTaskAccess
    await task.destroy();

    // Active Cache Invalidation
    await clearAssigneeCache(task.assignee);

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    next(error);
  }
};

const getTaskById = async (req, res, next) => {
  try {
    // req.task is already fetched and checked. We reload it with its associations:
    const task = await Task.findOne({
      where: { id: req.task.id },
      include: [
        {
          model: User,
          as: "assigneeUser",
          attributes: ["id", "name", "email", "role"],
        },
        {
          model: Project,
          attributes: ["id", "name"],
        },
      ],
    });
    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTasks,
  createTask,
  updateTask,
  advanceTaskStatus,
  deleteTask,
  getTaskById,
};
