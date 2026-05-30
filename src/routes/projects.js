const express = require("express");
const Joi = require("joi");
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validator");
const { getProjects, createProject, updateProject, deleteProject } = require("../controllers/projects");

const router = express.Router();

const projectSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    "any.required": "name is required",
    "string.empty": "name cannot be empty",
    "string.min": "name must be at least 2 characters long",
  }),
  description: Joi.string().allow("").max(500),
});

// All project routes require authentication
router.use(auth);

// Read projects
router.get("/", getProjects);

// Write/Mutate projects (ADMIN and MANAGER only)
router.post("/", requireRole(["ADMIN", "MANAGER"]), validate(projectSchema), createProject);
router.put("/:id", requireRole(["ADMIN", "MANAGER"]), validate(projectSchema), updateProject);
router.delete("/:id", requireRole(["ADMIN", "MANAGER"]), deleteProject);

module.exports = router;
