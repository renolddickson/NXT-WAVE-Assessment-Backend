const Task = require("../models/Task");
const User = require("../models/User");
const Project = require("../models/Project");
const { getCache, setCache, invalidateCachePattern } = require("../config/redis");
const { ValidationError } = require("../utils/errors");

const ALLOWED_TRANSITIONS = {
  TODO: ["IN_PROGRESS", "BLOCKED"],
  IN_PROGRESS: ["IN_REVIEW", "BLOCKED"],
  IN_REVIEW: ["DONE", "BLOCKED"],
  BLOCKED: ["TODO", "IN_PROGRESS", "IN_REVIEW"],
  DONE: [],
};

const clearAssigneeCache = async (assigneeId) => {
  if (!assigneeId) return;
  const pattern = `tasks:assignee:${assigneeId.toString()}:*`;
  await invalidateCachePattern(pattern);
};

const getTasks = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, priority, assignee } = req.query;

    const where = { organizationId: req.user.organizationId };

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

    if (cacheKey) {
      await setCache(cacheKey, result, 1800);
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const createTask = async (req, res, next) => {
  try {
    const { title, description, priority, assignee, projectId, due_date } = req.body;

    const assigneeUser = await User.findOne({
      where: { id: assignee, organizationId: req.user.organizationId },
    });
    if (!assigneeUser) {
      throw new ValidationError("Assignee must be a user in the same organization");
    }

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

    await clearAssigneeCache(assignee);

    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
};

const updateTask = async (req, res, next) => {
  try {
    const task = req.task;
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
    const task = req.task;
    const { status } = req.body;

    const currentStatus = task.status;

    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${status}. Allowed: ${allowedNext.join(", ") || "None"}`
      );
    }

    task.status = status;
    if (status === "DONE" && !task.completedAt) {
      task.completedAt = new Date();
    }
    await task.save();

    await clearAssigneeCache(task.assignee);

    res.status(200).json(task);
  } catch (error) {
    next(error);
  }
};

const deleteTask = async (req, res, next) => {
  try {
    const task = req.task;
    await task.destroy();

    await clearAssigneeCache(task.assignee);

    res.status(200).json({ message: "Task deleted successfully" });
  } catch (error) {
    next(error);
  }
};

const getTaskById = async (req, res, next) => {
  try {
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
