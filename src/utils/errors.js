class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(400, "VALIDATION_ERROR", message);
  }
}

class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHENTICATED", message);
  }
}

class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(409, "CONFLICT", message);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
};
