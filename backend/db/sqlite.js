import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../company.db");
let db = null;

function initDB() {
  try {
    if (fs.existsSync(dbPath)) {
      db = new Database(dbPath);
      console.log("[SQLite] Connected to company.db");
      return true;
    } else {
      console.warn("[SQLite] Database file missing at", dbPath);
      return false;
    }
  } catch (e) {
    console.error("[SQLite] Failed to initialize database:", e.message);
    return false;
  }
}

initDB();

/**
 * Basic search for people in SQLite
 * @param {string} query 
 * @returns {Array} Results
 */
export function sqliteSearch(query) {
  // Try to reconnect if not connected (e.g. if DB was created after server start)
  if (!db) {
    initDB();
  }

  if (!query || !db) return [];

  try {
    // Search in name or description since 'text' column might be legacy/not exist
    const stmt = db.prepare(`
      SELECT * FROM people 
      WHERE name LIKE ? OR description LIKE ? OR text LIKE ?
    `);

    const q = `%${query}%`;
    const results = stmt.all(q, q, q);

    return results.map(row => ({
      ...row,
      text: row.text || row.description || row.name, // Ensure 'text' field for frontend
      source: row.source || "SQLite",
      type: "PROFILE",
      priority: 1
    }));
  } catch (err) {
    console.error("[SQLite] Search error:", err.message);
    return [];
  }
}

// No default export needed for named exports
