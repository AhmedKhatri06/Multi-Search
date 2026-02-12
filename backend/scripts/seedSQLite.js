import Database from "better-sqlite3";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "../company.db");
const db = new Database(dbPath);

db.exec(`
  DROP TABLE IF EXISTS people;
  CREATE TABLE people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    title TEXT,
    entityKey TEXT,
    description TEXT,
    image TEXT,
    source TEXT
  );
`);

const insert = db.prepare(`
  INSERT INTO people (name, title, entityKey,description, image, source)
  VALUES (?, ? ,? ,? ,? ,?)
`);

insert.run("Elon Musk", "CEO of Tesla and SpaceX", "Elon Musk", "Elon Musk is the CEO of Tesla and SpaceX", "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Elon_Musk_-_54820081119_%28cropped%29.jpg/250px-Elon_Musk_-_54820081119_%28cropped%29.jpg", "SQLite");
insert.run("Sundar Pichai", " CEO of Google", "Sundar Pichai", "Sundar Pichai is the CEO of Google", "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Sundar_Pichai_-_2023_%28cropped%29.jpg/250px-Sundar_Pichai_-_2023_%28cropped%29.jpg", "SQLite");
insert.run("Ratan Tata ", "CEO of Tata Group", "Ratan Tata", "Ratan Tata is the CEO of Tata Group", "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Shri_Ratan_Naval_Tata.jpg/250px-Shri_Ratan_Naval_Tata.jpg  ", "SQLite");
insert.run("Ahmed Khatri", "Student", "Ahmed Khatri", "Ahmed Khatri is a Student", "https://media.licdn.com/dms/image/v2/D5603AQE83eOidV1I2Q/profile-displayphoto-scale_200_200/B56ZtPlj_cJAAc-/0/1766566808139?e=1769040000&v=beta&t=II7yw0iafFtTfmEUBXnN8UfXGqF_qLcJdkK0IaSdjAY", "SQLite");
insert.run("Mihir Doshi", "Co-founder & Director at Cyhex Infotech Private Limited", "Mihir Doshi", "Mihir Doshi is the Co-founder & Director at Cyhex Infotech Private Limited", "https://media.licdn.com/dms/image/v2/D4D03AQHi-kJwi0QS7Q/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1685911323894?e=1769040000&v=beta&t=a21sFnBIeff0obMKLvCVByhHDfF8f29DZ7H2AhH_ZVc", "SQLite");
insert.run("Mohammed Khatri", "Student of CSE branch", "Mohammed Khatri", "Mohammed Khatri is a student of CSE branch", "https://media.licdn.com/dms/image/v2/D4D03AQHi-kJwi0QS7Q/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1685911323894?e=1769040000&v=beta&t=a21sFnBIeff0obMKLvCVByhHDfF8f29DZ7H2AhH_ZVc", "SQLite");
insert.run("Moin Myuddin", "Full Stack Developer", "Moin Myuddin", "Moin Myuddin is a Full Stack Developer specializing in React and Node.js", "https://media.licdn.com/dms/image/v2/D4D03AQHi-kJwi0QS7Q/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1685911323894?e=1769040000&v=beta&t=a21sFnBIeff0obMKLvCVByhHDfF8f29DZ7H2AhH_ZVc", "SQLite");
console.log("SQLite seeded successfully");
