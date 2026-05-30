const express = require("express");
const Joi = require("joi");
const auth = require("../middleware/auth");
const { requireRole, checkTaskAccess } = require("../middleware/rbac");
const validate = require("../middleware/validator");
const {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  advanceTaskStatus,
  deleteTask,
} = require("../controllers/tasks");

const router = express.Router();

const createTaskSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required().messages({
    "any.required": "title is required",
    "string.empty": "title cannot be empty",
  }),
  description: Joi.string().allow("").max(2000),
  priority: Joi.string().valid("LOW", "MEDIUM", "HIGH").default("MEDIUM").required().messages({
    "any.required": "priority is required",
    "any.only": "priority must be one of LOW, MEDIUM, HIGH",
  }),
  assignee: Joi.string().uuid().required().messages({
    "any.required": "assignee is required",
    "string.guid": "assignee must be a valid UUID",
  }),
  projectId: Joi.string().uuid().optional().allow(null, ""),
  due_date: Joi.date().greater("now").required().messages({
    "date.greater": "due_date must be a future date",
    "date.base": "due_date must be a valid date",
    "any.required": "due_date is required",
  }),
});

const updateTaskSchema = Joi.object({
  title: Joi.string().trim().min(1).max(200),
  description: Joi.string().allow("").max(2000),
  priority: Joi.string().valid("LOW", "MEDIUM", "HIGH"),
  assignee: Joi.string().uuid().messages({
    "string.guid": "assignee must be a valid UUID",
  }),
  projectId: Joi.string().uuid().allow(null, ""),
  due_date: Joi.date().greater("now").messages({
    "date.greater": "due_date must be a future date",
    "date.base": "due_date must be a valid date",
  }),
});

const advanceStatusSchema = Joi.object({
  status: Joi.string().valid("TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED").required().messages({
    "any.required": "status is required",
    "any.only": "status must be one of TODO, IN_PROGRESS, IN_REVIEW, DONE, BLOCKED",
  }),
});

router.use(auth);

router.get("/", getTasks);

router.post("/", requireRole(["ADMIN", "MANAGER"]), validate(createTaskSchema), createTask);

router.get("/:id", checkTaskAccess, getTaskById);
router.put("/:id", requireRole(["ADMIN", "MANAGER"]), checkTaskAccess, validate(updateTaskSchema), updateTask);
router.patch("/:id/status", checkTaskAccess, validate(advanceStatusSchema), advanceTaskStatus);
router.delete("/:id", requireRole(["ADMIN", "MANAGER"]), checkTaskAccess, deleteTask);

module.exports = router;
