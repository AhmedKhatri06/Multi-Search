import express from "express";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";
import axios from "axios";
import { identifyPeople } from "../services/aiService.js";

dotenv.config();

const router = express.Router();

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

/**
 * Core search logic combined across MongoDB, SQLite, and SerpAPI.
 */
async function performSearch(query) {
  // 1. Primary searches (Exact substring)
  const queryWords = query.split(" ").filter(w => w.length > 2);

  let mongoResults = await Document.find({
    text: { $regex: query, $options: "i" }
  }).lean();

  let sqliteResults = await sqliteSearch(query);

  // 2. Fallback: If no results, try keyword-based search (common for long AI-generated queries)
  if (mongoResults.length === 0 && queryWords.length >= 2) {
    const nameGuess = queryWords.slice(0, 2).join(" ");
    mongoResults = await Document.find({
      text: { $regex: nameGuess, $options: "i" }
    }).lean();
  }

  // 3. Deeper Fallback: Keyword intersection
  if (mongoResults.length === 0 && queryWords.length > 0) {
    mongoResults = await Document.find({
      $and: queryWords.slice(0, 3).map(word => ({
        text: { $regex: word, $options: "i" }
      }))
    }).lean();
  }

  // Improve internet query using local profile (if found)
  let internetQuery = query;
  if (sqliteResults && sqliteResults.length > 0) {
    const p = sqliteResults[0];
    internetQuery = `${p.name} ${p.title || ""}`.trim();
  }

  // REAL INTERNET SEARCH – SERPAPI (GOOGLE)
  let internetResults = [];
  try {
    const response = await axios.get("https://serpapi.com/search", {
      params: {
        q: internetQuery,
        engine: "google",
        api_key: process.env.SERPAPI_KEY,
        num: 5
      }
    });

    const results = response.data?.organic_results || [];

    results.forEach((item, index) => {
      internetResults.push({
        id: `google-${index}`,
        title: item.title,
        text: item.snippet,
        url: item.link,
        source: "Internet",
        provider: "Google",
        type: "AUX",
        priority: 3
      });
    });
  } catch (err) {
    console.error("SerpAPI search failed:", err.message);
  }

  // Deduplicate Internet results by URL
  const internetMap = new Map();
  internetResults.forEach(item => {
    if (!item.url) return;
    const key = normalize(item.url);
    if (!internetMap.has(key)) {
      internetMap.set(key, item);
    }
  });
  const dedupedInternetResults = Array.from(internetMap.values());

  // Deduplicate Local results by text
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

  const combined = [...dedupedLocalResults, ...dedupedInternetResults];
  const rankedResults = rankResults(combined, query);

  return rankedResults;
}

// Main multi-search endpoint (Stage 2)
router.post("/", async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query required" });

  try {
    const enrichedResults = await performSearch(query);

    const finalResults = enrichedResults.map(item => {
      let confidence = "Found Online";
      if (item.type === "PROFILE" || item.type === "RECORD") {
        confidence = "Verified (Local DB)";
      }
      return { ...item, confidence };
    });

    const groupedResults = {
      profile: finalResults.filter(r => r.type === "PROFILE"),
      records: finalResults.filter(r => r.type === "RECORD"),
      auxiliary: finalResults.filter(r => r.type === "AUX")
    };

    const images = [
      ...new Set(finalResults.flatMap(r => r.images || []).filter(Boolean))
    ];

    res.json({
      query,
      total: finalResults.length,
      images,
      profile: groupedResults.profile,
      records: groupedResults.records,
      auxiliary: groupedResults.auxiliary
    });
  } catch (err) {
    console.error("Multi-search failed:", err);
    res.status(500).json({ error: "Search failed" });
  }
});

// New identification endpoint (Stage 1)
router.post("/identify", async (req, res) => {
  const { name, location, keywords } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    // Perform a broad search to gather context for AI
    const searchQuery = `${name} ${location || ""} ${keywords || ""}`.trim();
    const searchResults = await performSearch(searchQuery);

    // Call AI to identify candidates from results
    const identification = await identifyPeople({
      name,
      location,
      keywords,
      searchResults
    });

    res.json(identification);
  } catch (err) {
    console.error("Identification failed:", err);
    res.status(500).json({ error: "Identification failed" });
  }
});

export default router;
