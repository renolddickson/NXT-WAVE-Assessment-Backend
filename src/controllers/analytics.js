const { sequelize } = require("../config/db");

const getTaskAnalytics = async (req, res, next) => {
  try {
    const [rows] = await sequelize.query(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.role,
        COUNT(t.id) FILTER (
          WHERE t.due_date < NOW()
          AND t.status <> 'DONE'
        )::int AS "overdueTaskCount",
        ROUND(
          (
            AVG(
            EXTRACT(EPOCH FROM (t."completedAt" - t."createdAt")) / 3600
            ) FILTER (
              WHERE t.status = 'DONE'
              AND t."completedAt" IS NOT NULL
            )
          )::numeric,
          2
        ) AS "avgCompletionTimeHours"
      FROM "Users" u
      LEFT JOIN "Tasks" t
        ON t.assignee = u.id
        AND t."organizationId" = u."organizationId"
      WHERE u."organizationId" = :organizationId
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY u.name ASC;
      `,
      {
        replacements: { organizationId: req.user.organizationId },
      }
    );

    const analytics = rows.map((row) => ({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
      },
      overdueTaskCount: Number(row.overdueTaskCount),
      avgCompletionTimeHours:
        row.avgCompletionTimeHours === null ? null : Number(row.avgCompletionTimeHours),
    }));

    res.status(200).json({ analytics });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTaskAnalytics,
};
