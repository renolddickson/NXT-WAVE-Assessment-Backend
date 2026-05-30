const { AppError } = require("../utils/errors");

const errorHandler = (err, req, res, next) => {
  // If the error is our custom AppError, format and send it
  if (err instanceof AppError) {
    return res.status(err.status).json({
      status: err.status,
      code: err.code,
      message: err.message,
    });
  }

  // Handle Mongoose duplicate key error (11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      status: 409,
      code: "CONFLICT",
      message: `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`,
    });
  }

  // Handle Mongoose validation errors
  if (err.name === "ValidationError") {
    const firstError = Object.values(err.errors)[0];
    return res.status(400).json({
      status: 400,
      code: "VALIDATION_ERROR",
      message: firstError.message,
    });
  }

  // Handle Mongoose CastError (e.g. invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      status: 400,
      code: "VALIDATION_ERROR",
      message: `Invalid ID format for path '${err.path}'`,
    });
  }

  // Express JSON parsing error
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid JSON body",
    });
  }

  // Log unhandled exceptions
  console.error("Unhandled Server Error:", err);

  // Return standard 500 error
  return res.status(500).json({
    status: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
  });
};

module.exports = errorHandler;
