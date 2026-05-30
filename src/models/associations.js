const Organization = require("./Organization");
const User = require("./User");
const RefreshToken = require("./RefreshToken");
const Project = require("./Project");
const Task = require("./Task");

Organization.hasMany(User, { foreignKey: "organizationId", onDelete: "CASCADE" });
User.belongsTo(Organization, { foreignKey: "organizationId" });

Organization.hasMany(Project, { foreignKey: "organizationId", onDelete: "CASCADE" });
Project.belongsTo(Organization, { foreignKey: "organizationId" });

Organization.hasMany(Task, { foreignKey: "organizationId", onDelete: "CASCADE" });
Task.belongsTo(Organization, { foreignKey: "organizationId" });

Project.hasMany(Task, { foreignKey: "projectId", onDelete: "SET NULL" });
Task.belongsTo(Project, { foreignKey: "projectId" });

User.hasMany(RefreshToken, { foreignKey: "userId", onDelete: "CASCADE" });
RefreshToken.belongsTo(User, { foreignKey: "userId" });

User.hasMany(Task, { foreignKey: "assignee", onDelete: "RESTRICT" });
Task.belongsTo(User, { as: "assigneeUser", foreignKey: "assignee" });

module.exports = {
  Organization,
  User,
  RefreshToken,
  Project,
  Task,
};
