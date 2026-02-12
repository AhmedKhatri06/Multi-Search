import Database from "better-sqlite3";
const db = new Database("company.db");

export function sqliteGetById(id) {
  return db.prepare(
    "SELECT * FROM people WHERE id = ?"
  ).get(id);
}
