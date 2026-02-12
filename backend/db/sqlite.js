import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../company.db");
const db = new Database(dbPath);

/**
 * Basic search for people in SQLite
 * @param {string} query 
 * @returns {Array} Results
 */
export function sqliteSearch(query) {
  if (!query) return [];

  const stmt = db.prepare(`
    SELECT * FROM people 
    WHERE text LIKE ?
  `);

  const results = stmt.all(`%${query}%`);

  return results.map(row => ({
    ...row,
    source: row.source || "SQLite",
    type: "PROFILE", // Tag as profile for rankResults
    priority: 1
  }));
}

export default { sqliteSearch };
