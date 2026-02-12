import mongoose from "mongoose";
import Document from "../models/Document.js";
import dotenv from "dotenv";

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

await Document.deleteMany({});

await Document.insertMany([
  {
    text: "Elon Musk founded SpaceX to reduce space transportation costs.",
    source: "MongoDB",
    entityKey: "Elon Musk",
    metadata: { topic: "SpaceX" }
  },
  {
    text: "Elon Musk joined Tesla Motors as chairman and later became CEO.",
    source: "MongoDB",
    entityKey: "Elon Musk",
    metadata: { topic: "Tesla" }
  },
  {
    text: "Elon Musk is involved in Neuralink and The Boring Company.",
    source: "MongoDB",
    entityKey: "Elon Musk",
    metadata: { topic: "Companies" }
  },
  {
    text: "Ahmed Khatri p.",
    source: "MongoDB",
    entityKey: "Ahmed Khatri",
    metadata: { topic: "Ahmed Khatri" }
  },
  {
    text: "Mihir Doshi is the co-founder and director of Cyhex Infotech Private Limited.",
    source: "MongoDB",
    entityKey: "Mihir Doshi",
    metadata: { topic: "Mihir Doshi" }
  }
]);

console.log("✅ MongoDB seeded");
process.exit();
