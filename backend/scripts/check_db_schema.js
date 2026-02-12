import Database from 'better-sqlite3';

try {
    const db = new Database('d:/Multi-Search/backend/company.db');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log("Tables in database:", tables);

    for (const table of tables) {
        console.log(`\nSchema for table ${table.name}:`);
        console.log(db.prepare(`PRAGMA table_info(${table.name})`).all());
    }
} catch (err) {
    console.error("Database check failed:", err);
}
