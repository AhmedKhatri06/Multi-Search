import Database from "better-sqlite3";

const db = new Database("company.db");

export function sqliteSearch(query) {
  const stmt = db.prepare(`
    SELECT
      id,
      name,
      title,
      description,
      image,
      source
    FROM people
    WHERE name LIKE ?
      OR title LIKE ?
      OR description LIKE ?
      OR source LIKE ?
  `);

  return stmt.all(
    `%${query}%`,
    `%${query}%`,
    `%${query}%`,
    `%${query}%`
  );
}
export default db;