const { ValidationError } = require("../utils/errors");

const validate = (schema, target = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[target], {
      abortEarly: true,
      allowUnknown: false,
      stripUnknown: true,
    });

    if (error) {
      const message = error.details[0].message.replace(/"/g, "");
      return next(new ValidationError(message));
    }

    req[target] = value;
    next();
  };
};

module.exports = validate;
