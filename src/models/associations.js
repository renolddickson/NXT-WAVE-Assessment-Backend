const Organization = require("./Organization");
const User = require("./User");
const RefreshToken = require("./RefreshToken");
const Project = require("./Project");
const Task = require("./Task");

// 1. Organization <-> User
Organization.hasMany(User, { foreignKey: "organizationId", onDelete: "CASCADE" });
User.belongsTo(Organization, { foreignKey: "organizationId" });

// 2. Organization <-> Project
Organization.hasMany(Project, { foreignKey: "organizationId", onDelete: "CASCADE" });
Project.belongsTo(Organization, { foreignKey: "organizationId" });

// 3. Organization <-> Task
Organization.hasMany(Task, { foreignKey: "organizationId", onDelete: "CASCADE" });
Task.belongsTo(Organization, { foreignKey: "organizationId" });

// 4. Project <-> Task
Project.hasMany(Task, { foreignKey: "projectId", onDelete: "SET NULL" });
Task.belongsTo(Project, { foreignKey: "projectId" });

// 5. User <-> RefreshToken
User.hasMany(RefreshToken, { foreignKey: "userId", onDelete: "CASCADE" });
RefreshToken.belongsTo(User, { foreignKey: "userId" });

// 6. User <-> Task (Assignee)
User.hasMany(Task, { foreignKey: "assignee", onDelete: "RESTRICT" });
Task.belongsTo(User, { as: "assigneeUser", foreignKey: "assignee" });

module.exports = {
  Organization,
  User,
  RefreshToken,
  Project,
  Task,
};
