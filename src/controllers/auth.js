const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Op } = require("sequelize");
const { sequelize } = require("../config/db");
const Organization = require("../models/Organization");
const User = require("../models/User");
const RefreshToken = require("../models/RefreshToken");
const { ConflictError, AuthenticationError } = require("../utils/errors");

const generateTokenPair = async (user) => {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role, organizationId: user.organizationId },
    process.env.JWT_ACCESS_SECRET || "super_secret_access_key_12345",
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || "15m" }
  );

  const refreshTokenValue = jwt.sign(
    { userId: user.id, tokenId: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET || "super_secret_refresh_key_12345",
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || "7d" }
  );

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await RefreshToken.create({
    token: refreshTokenValue,
    userId: user.id,
    expiresAt,
  });

  return { accessToken, refreshToken: refreshTokenValue };
};

const register = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { name, email, password, organizationName } = req.body;

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictError("Email already in use");
    }

    const organization = await Organization.create(
      { name: organizationName },
      { transaction }
    );

    const user = await User.create(
      {
        name,
        email,
        password,
        role: "ADMIN",
        organizationId: organization.id,
      },
      { transaction }
    );

    await transaction.commit();

    const tokens = await generateTokenPair(user);

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      ...tokens,
    });
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user) {
      throw new AuthenticationError("Invalid email or password");
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AuthenticationError("Invalid email or password");
    }

    const tokens = await generateTokenPair(user);

    res.status(200).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      ...tokens,
    });
  } catch (error) {
    next(error);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const tokenDoc = await RefreshToken.findOne({
      where: {
        token: refreshToken,
        isRevoked: false,
        expiresAt: {
          [Op.gt]: new Date(),
        },
      },
    });

    if (!tokenDoc) {
      throw new AuthenticationError("Invalid or expired refresh token");
    }

    tokenDoc.isRevoked = true;
    await tokenDoc.save();

    const user = await User.findByPk(tokenDoc.userId);
    if (!user) {
      throw new AuthenticationError("User associated with token not found");
    }

    const tokens = await generateTokenPair(user);

    res.status(200).json(tokens);
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    const tokenDoc = await RefreshToken.findOne({ where: { token: refreshToken } });
    if (tokenDoc) {
      tokenDoc.isRevoked = true;
      await tokenDoc.save();
    }

    res.status(200).json({ message: "Logout successful" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refresh,
  logout,
};
