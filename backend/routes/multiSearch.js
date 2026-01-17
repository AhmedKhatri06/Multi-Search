import express from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";
import { aggregateSources } from "../services/sourceAggregator.js";
import { generateAISummary } from "../services/aiSummary.js";
import axios from "axios";

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

  // Internet Search
  // 🌐 Internet Search (DuckDuckGo + Wikipedia)
let internetResults = [];

try {
  const internetResponse = await axios.get(
    `${process.env.BACKEND_URL}/api/search/internet?q=${encodeURIComponent(query)}`
  );

  const internetData = internetResponse.data;

  // Wikipedia result
  if (internetData.wikipedia) {
    internetResults.push({
      id: `wiki-${query}`,
      text: internetData.wikipedia.description || internetData.wikipedia.title,
      title: internetData.wikipedia.title,
      description: internetData.wikipedia.description,
      url: internetData.wikipedia.pageUrl,
      source: "Internet",
      provider: "Wikipedia",
      type: "AUX",
      priority: 3
    });
  }

  // DuckDuckGo related topics
  if (internetData.duckDuckGo?.relatedTopics) {
    internetData.duckDuckGo.relatedTopics.forEach((item, index) => {
      internetResults.push({
        id: `ddg-${index}`,
        text: item.Text,
        title: item.Text,
        url: item.FirstURL,
        source: "Internet",
        provider: "DuckDuckGo",
        type: "AUX",
        priority: 3
      });
    });
  }
} catch (error) {
  console.error("Internet search failed:", error.message);
}


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
    })),
    ...internetResults
  ];
  const rankedResults = rankResults(combined, query);

  const groupedResults = {
    profile: rankedResults.filter(r => r.type === "PROFILE"),
    records: rankedResults.filter(r => r.type === "RECORD"),
    auxiliary: rankedResults.filter(r => r.type === "AUX")
  };

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
  });

});

export default router;
