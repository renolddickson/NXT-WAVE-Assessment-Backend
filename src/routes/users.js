const express = require("express");
const Joi = require("joi");
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const validate = require("../middleware/validator");
const { getUsers, createUser, updateUser, deleteUser } = require("../controllers/users");

const router = express.Router();

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    "any.required": "name is required",
    "string.empty": "name cannot be empty",
  }),
  email: Joi.string().email().required().messages({
    "any.required": "email is required",
    "string.empty": "email cannot be empty",
    "string.email": "email must be a valid email address",
  }),
  password: Joi.string().min(6).required().messages({
    "any.required": "password is required",
    "string.empty": "password cannot be empty",
    "string.min": "password must be at least 6 characters long",
  }),
  role: Joi.string().valid("ADMIN", "MANAGER", "MEMBER").required().messages({
    "any.required": "role is required",
    "any.only": "role must be one of ADMIN, MANAGER, MEMBER",
  }),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).messages({
    "string.empty": "name cannot be empty",
  }),
  email: Joi.string().email().messages({
    "string.empty": "email cannot be empty",
    "string.email": "email must be a valid email address",
  }),
  password: Joi.string().min(6).messages({
    "string.empty": "password cannot be empty",
    "string.min": "password must be at least 6 characters long",
  }),
  role: Joi.string().valid("ADMIN", "MANAGER", "MEMBER").messages({
    "any.only": "role must be one of ADMIN, MANAGER, MEMBER",
  }),
})
  .min(1)
  .messages({
    "object.min": "at least one field is required",
  });

router.use(auth);
router.use(requireRole(["ADMIN"]));

router.get("/", getUsers);
router.post("/", validate(createUserSchema), createUser);
router.put("/:id", validate(updateUserSchema), updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
