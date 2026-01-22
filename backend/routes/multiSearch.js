import express from "express";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";
import axios from "axios";
const internetCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
dotenv.config();
function normalize(value = "") {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function rankResults(results, query) {
  const q = normalize(query);

  return results
    .map(item => {
      const text = (item.text || "").toLowerCase();
      let score = 0;

      if (text.includes(q)) score += 5;
      if (text.startsWith(q)) score += 3;
      score += text.split(q).length - 1;

      // Entity importance (PROFILE > RECORD > AUX)
      score += (4 - item.priority) * 10;
      // ✅ FIX: ensure internet results don't disappear
      if (item.source === "Internet") {
        score += 5;
      }

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
  // STEP 3: Improve internet query using local profile (if found)
  let internetQuery = query;

  if (sqliteResults.length > 0) {
    const p = sqliteResults[0];
    internetQuery = `${p.name} ${p.title || ""}`.trim();
  }

  // Internet Search
  // 🌍 GLOBAL INTERNET SEARCH (NO IMAGES, LINKS ONLY)
let internetResults = [];

try {
  const response = await axios.get("https://api.duckduckgo.com/", {
    params: {
      q: internetQuery,
      format: "json",
      no_redirect: 1,
      no_html: 1
    }
  });

  const data = response.data;

  // Wikipedia-style abstract
  if (data.AbstractText && data.AbstractURL) {
    internetResults.push({
      id: `wiki-${query}`,
      text: data.AbstractText,
      title: data.Heading,
      url: data.AbstractURL,
      source: "Internet",
      provider: "Wikipedia",
      type: "AUX",
      priority: 3
    });
  }

  // DuckDuckGo related links
  (data.RelatedTopics || []).forEach((item, index) => {
    if (item.Text && item.FirstURL) {
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
    }
  });

} catch (err) {
  console.error("Global search failed:", err.message);
}

  // ✅ STEP 8.6 – Deduplicate Internet results by URL
  const internetMap = new Map();

  internetResults.forEach(item => {
    if (!item.url) return;

    const key = normalize(item.url);
    if (!internetMap.has(key)) {
      internetMap.set(key, item);
    }
  });

  const dedupedInternetResults = Array.from(internetMap.values());

  // ✅ STEP 8.6 – Deduplicate Local results by text
  const localMap = new Map();

  [
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
    }))
  ].forEach(item => {
    const key = normalize(item.text);
    if (!localMap.has(key)) {
      localMap.set(key, item);
    }
  });

  const dedupedLocalResults = Array.from(localMap.values());

  // Final combined results
  const combined = [
    ...dedupedLocalResults,
    ...dedupedInternetResults
  ];

  const rankedResults = rankResults(combined, query);
  //  Add confidence labels
  const enrichedResults = rankedResults.map(item => {
    let confidence = "Found Online";

    if (item.type === "PROFILE" || item.type === "RECORD") {
      confidence = "Verified (Local DB)";
    }

    return {
      ...item,
      confidence
    };
  });

  const groupedResults = {
    profile: enrichedResults.filter(r => r.type === "PROFILE"),
    records: enrichedResults.filter(r => r.type === "RECORD"),
    auxiliary: enrichedResults.filter(r => r.type === "AUX")
  };

  const images = [
    ...new Set(enrichedResults.flatMap(r => r.images || []).filter(Boolean))
  ];

  return res.json({
    query,
    total: enrichedResults.length,
    images,
    profile: groupedResults.profile,
    records: groupedResults.records,
    auxiliary: groupedResults.auxiliary,
    rankedSources: {
      wikipedia:
        internetResults.find(r => r.provider === "Wikipedia") || null,
      duckDuckGo:
        internetResults.filter(r => r.provider === "DuckDuckGo") || []
    }
  });

});

export default router;
