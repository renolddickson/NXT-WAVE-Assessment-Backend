const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const Task = sequelize.define(
  "Task",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
    },
    priority: {
      type: DataTypes.ENUM("LOW", "MEDIUM", "HIGH"),
      allowNull: false,
      defaultValue: "MEDIUM",
    },
    status: {
      type: DataTypes.ENUM("TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"),
      allowNull: false,
      defaultValue: "TODO",
    },
    assignee: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    projectId: {
      type: DataTypes.UUID,
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    due_date: {
      type: DataTypes.DATE,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        fields: ["status"],
      },
      {
        fields: ["assignee"],
      },
      {
        fields: ["due_date"],
      },
      {
        fields: ["organizationId"],
      },
      {
        name: "tasks_org_assignee_status_priority_compound",
        fields: ["organizationId", "assignee", "status", "priority"],
      },
    ],
  }
);

module.exports = Task;
