const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { AuthenticationError } = require("../utils/errors");

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AuthenticationError("Bearer access token is required");
    }

    const token = authHeader.split(" ")[1];
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || "super_secret_access_key_12345");
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        throw new AuthenticationError("Access token has expired");
      }
      throw new AuthenticationError("Invalid access token");
    }

    const user = await User.findByPk(payload.userId);
    if (!user) {
      throw new AuthenticationError("Authenticated user not found");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = auth;
