const express = require("express");
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { getTaskAnalytics } = require("../controllers/analytics");

const router = express.Router();

router.use(auth);
router.use(requireRole(["ADMIN", "MANAGER"]));

router.get("/tasks", getTaskAnalytics);

module.exports = router;
