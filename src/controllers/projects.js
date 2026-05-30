const Project = require("../models/Project");
const { NotFoundError } = require("../utils/errors");

const getProjects = async (req, res, next) => {
  try {
    const projects = await Project.findAll({
      where: { organizationId: req.user.organizationId },
      order: [["createdAt", "DESC"]],
    });
    res.status(200).json(projects);
  } catch (error) {
    next(error);
  }
};

const createProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const project = await Project.create({
      name,
      description,
      organizationId: req.user.organizationId,
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
};

const updateProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;

    const project = await Project.findOne({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
      },
    });

    if (!project) {
      throw new NotFoundError("Project not found");
    }

    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    await project.save();

    res.status(200).json(project);
  } catch (error) {
    next(error);
  }
};

const deleteProject = async (req, res, next) => {
  try {
    const deletedCount = await Project.destroy({
      where: {
        id: req.params.id,
        organizationId: req.user.organizationId,
      },
    });

    if (deletedCount === 0) {
      throw new NotFoundError("Project not found");
    }

    res.status(200).json({ message: "Project deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProjects,
  createProject,
  updateProject,
  deleteProject,
};
