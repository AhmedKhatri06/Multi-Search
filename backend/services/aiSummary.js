import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";
import { aggregateSources } from "../services/sourceAggregator.js";
import { generateAISummary } from "../services/aiSummary.js";

dotenv.config();

function rankResults(results, query) {
  const q = query.toLowerCase();
  return results
    .map(item => {
      const text = (item.text || "").toLowerCase();
      let score = 0;
      if (text.includes(q)) score += 5;
      if (text.startsWith(q)) score += 3;
      score += text.split(q).length - 1;
      // Entity importance (PROFILE > RECORD > AUX)
      score += (4 - item.priority) * 10;
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);
}

const router = express.Router();

router.post("/", async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: "Query required" });
  }

  // MongoDB → RECORDS
  const mongoResults = await Document.find({
    text: { $regex: query, $options: "i" }
  }).lean();

  // SQLite → PROFILE
  const sqliteResults = await sqliteSearch(query);

  // JSON → AUXILIARY
  const filePath = path.resolve("data/companyData.json");
  const fileData = JSON.parse(fs.readFileSync(filePath));
  const jsonResults = fileData.filter(item => {
    const titleMatch = item.title?.toLowerCase().includes(query.toLowerCase());
    const descMatch = item.description?.toLowerCase().includes(query.toLowerCase());
    return titleMatch || descMatch;
  });

  const combined = [
    ...mongoResults.map(doc => ({
      id: doc._id,
      text: doc.text,
      source: "MongoDB",
      type: "RECORD",
      priority: 2
    })),
    ...sqliteResults.map(doc => ({
      id: doc.id,
      text: `${doc.name} - ${doc.title}`,
      source: "SQLite",
      type: "PROFILE",
      priority: 1,
      images: [doc.image].filter(Boolean)
    })),
    ...jsonResults.map(doc => ({
      id: doc.id,
      text: `${doc.title} - ${doc.description}`,
      title: doc.title,
      description: doc.description,
      url: doc.url,
      type: "AUX",
      source: doc.source,
      priority: 3,
      category: doc.category
    }))
  ];

  const rankedResults = rankResults(combined, query);

  const groupedResults = {
    profile: rankedResults.filter(r => r.type === "PROFILE"),
    records: rankedResults.filter(r => r.type === "RECORD"),
    auxiliary: rankedResults.filter(r => r.type === "AUX")
  };

  // ✅ Build clean AI-ready sources
  const aiSources = [
    ...groupedResults.profile.map(p => ({
      content: p.text,
      source: p.source
    })),
    ...groupedResults.records.map(r => ({
      content: r.text,
      source: r.source
    })),
    ...groupedResults.auxiliary.map(a => ({
      content: a.text || a.description || a.title,
      source: a.source
    }))
  ].filter(s => s.content);

  // 🔧 FIXED: Generate AI summary
  let aiSummary = null;
  try {
    // ✅ Remove 'const' - just assign to the existing 'let' variable
    aiSummary = await generateAISummary(query, aiSources);
    
    if (!aiSummary || typeof aiSummary !== "string" || aiSummary.trim() === "") {
      console.warn("AI summary empty or invalid");
      aiSummary = "AI summary not available";
    } else {
      console.log("✅ AI Summary generated:", aiSummary.slice(0, 100));
    }
  } catch (err) {
    console.error("❌ AI summary failed:", err.message);
    aiSummary = "AI summary not available";
  }

  const images = [
    ...new Set(rankedResults.flatMap(r => r.images || []).filter(Boolean))
  ];

  return res.json({
    query,
    total: rankedResults.length,
    images,
    profile: groupedResults.profile,
    records: groupedResults.records,
    auxiliary: groupedResults.auxiliary,
    summary: aiSummary,
    summarySources: aiSources
  });
});

export default router;