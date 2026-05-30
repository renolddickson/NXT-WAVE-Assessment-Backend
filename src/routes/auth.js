const express = require("express");
const Joi = require("joi");
const { register, login, refresh, logout } = require("../controllers/auth");
const validate = require("../middleware/validator");

const router = express.Router();

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required().messages({
    "any.required": "name is required",
    "string.empty": "name cannot be empty",
    "string.min": "name must be at least 2 characters long",
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
  organizationName: Joi.string().min(2).max(100).required().messages({
    "any.required": "organizationName is required",
    "string.empty": "organizationName cannot be empty",
    "string.min": "organizationName must be at least 2 characters long",
  }),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required().messages({
    "any.required": "email is required",
    "string.empty": "email cannot be empty",
    "string.email": "email must be a valid email address",
  }),
  password: Joi.string().required().messages({
    "any.required": "password is required",
    "string.empty": "password cannot be empty",
  }),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required().messages({
    "any.required": "refreshToken is required",
    "string.empty": "refreshToken cannot be empty",
  }),
});

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", validate(refreshSchema), logout);

module.exports = router;
