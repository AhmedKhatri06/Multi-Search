import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../company.db");
let db = null;

try {
  if (fs.existsSync(dbPath)) {
    db = new Database(dbPath);
    console.log("[SQLite] Connected to company.db");
  } else {
    console.warn("[SQLite] Database file missing at", dbPath);
  }
} catch (e) {
  console.error("[SQLite] Failed to initialize database:", e.message);
}

/**
 * Basic search for people in SQLite
 * @param {string} query 
 * @returns {Array} Results
 */
export function sqliteSearch(query) {
  if (!query || !db) return [];

  try {
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
  } catch (err) {
    console.error("[SQLite] Search error:", err.message);
    return [];
  }
}

export default { sqliteSearch };
