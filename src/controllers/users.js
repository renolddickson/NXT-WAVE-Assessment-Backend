const User = require("../models/User");
const { ConflictError } = require("../utils/errors");

const getUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({
      where: { organizationId: req.user.organizationId },
      attributes: { exclude: ["password"] },
      order: [["createdAt", "DESC"]],
    });

    res.status(200).json(users);
  } catch (error) {
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictError("Email already in use");
    }

    const newUser = await User.create({
      name,
      email,
      password,
      role,
      organizationId: req.user.organizationId,
    });

    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      organizationId: newUser.organizationId,
      createdAt: newUser.createdAt,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  createUser,
};
