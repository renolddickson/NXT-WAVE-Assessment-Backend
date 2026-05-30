const User = require("../models/User");
const { ConflictError, NotFoundError } = require("../utils/errors");

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

const updateUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const user = await User.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
      },
    });

    if (!user) {
      throw new NotFoundError("User not found");
    }

    if (email && email !== user.email) {
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        throw new ConflictError("Email already in use");
      }
      user.email = email;
    }

    if (name !== undefined) user.name = name;
    if (password !== undefined) user.password = password;
    if (role !== undefined) user.role = role;

    await user.save();

    res.status(200).json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const deletedCount = await User.destroy({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
      },
    });

    if (deletedCount === 0) {
      throw new NotFoundError("User not found");
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
};
