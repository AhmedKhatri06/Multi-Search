import Database from "better-sqlite3";

const db = new Database("company.db");

export function sqliteSearch(query) {
  // First attempt: Exact substring match
  const stmt = db.prepare(`
    SELECT id, name, title, description, image, source
    FROM people
    WHERE name LIKE ? OR title LIKE ? OR description LIKE ?
  `);

  let results = stmt.all(`%${query}%`, `%${query}%`, `%${query}%`);

  // Second attempt: If no results and query is long, try matching name (first 2-3 words)
  if (results.length === 0) {
    const words = query.split(" ").filter(w => w.length > 2);
    if (words.length >= 2) {
      const nameGuess = `${words[0]} ${words[1]}`;
      results = stmt.all(`%${nameGuess}%`, `%${nameGuess}%`, `%${nameGuess}%`);
    }
  }

  // Third attempt: Keyword intersection (for queries like "Mihir Cyhex")
  if (results.length === 0) {
    const words = query.split(" ").filter(w => w.length > 2).slice(0, 3);
    if (words.length > 0) {
      const clauses = words.map(() => "(name LIKE ? OR title LIKE ? OR description LIKE ?)").join(" AND ");
      const params = words.flatMap(w => [`%${w}%`, `%${w}%`, `%${w}%`]);
      const keywordStmt = db.prepare(`SELECT id, name, title, description, image, source FROM people WHERE ${clauses}`);
      results = keywordStmt.all(...params);
    }
  }

  return results;
}
export default db;