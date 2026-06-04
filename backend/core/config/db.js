const { Pool } = require('pg');

const databaseUrl = process.env.DATABASE_URL || `postgresql://postgres:${process.env.POSTGRES_PASSWORD}@postgresql:5432/pm-tool`;

const pool = new Pool({
  connectionString: databaseUrl,
});

module.exports = {
  query: (text, params) => pool.query(text, params),
};
