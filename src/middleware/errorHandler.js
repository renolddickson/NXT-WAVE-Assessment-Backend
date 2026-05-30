const { AppError } = require("../utils/errors");

const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      status: err.status,
      code: err.code,
      message: err.message,
    });
  }

  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      status: 409,
      code: "CONFLICT",
      message: err.errors[0].message || "Duplicate entry constraint violation",
    });
  }

  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      status: 400,
      code: "VALIDATION_ERROR",
      message: err.errors[0].message,
    });
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid JSON body",
    });
  }

  console.error("Unhandled Server Error:", err);

  return res.status(500).json({
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
};

module.exports = errorHandler;
