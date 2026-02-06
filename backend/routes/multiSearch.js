import express from "express";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import SearchCache from "../models/SearchCache.js";
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
  const normQuery = normalize(query);

  // Check Cache
  const cached = await SearchCache.findOne({ query: normQuery, type: "SEARCH" });
  if (cached) {
    console.log(`[CACHE HIT] Search: "${normQuery}"`);
    return cached.data;
  }

  // 1. Primary searches (Exact substring)
  const queryWords = query.split(" ").filter(w => w.length > 1); // Allow short words like initials
  // Try to find the name: usually the first 2-3 words. 
  // If the query is "Pankaj SBMP", targetName should at least be "Pankaj".
  const targetName = queryWords.length > 2 ? queryWords.slice(0, 2).join(" ") : queryWords[0] || query;
  const context = queryWords.length > 2 ? queryWords.slice(2).join(" ") : queryWords.slice(1).join(" ");

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
    // 🔹 PRECISION QUERY: Target individual profile pages specifically
    const profileSites = [
      "site:linkedin.com/in/",
      "site:instagram.com",
      "site:facebook.com",
      "site:twitter.com",
      "site:x.com",
      "site:bumble.com",
      "site:rocketreach.co/p/",
      "site:linkedin.com/posts/"
    ].join(" OR ");

    const socialQuery = `${internetQuery} (${profileSites})`.trim();

    const response = await axios.get("https://serpapi.com/search", {
      params: {
        q: socialQuery,
        engine: "google",
        api_key: process.env.SERPAPI_KEY,
        num: 20 // High volume to allow for strict filtering
      }
    });

    const results = response.data?.organic_results || [];

    results.forEach((item, index) => {
      let provider = "Google";
      const link = (item.link || "").toLowerCase();
      const title = (item.title || "").toLowerCase();
      const snippet = (item.snippet || "").toLowerCase();
      const nameLower = targetName.toLowerCase();

      // 🔹 IMPROVED FILTER: More flexible name matching
      const nameParts = nameLower.split(" ");
      // Must match at least the first part of the name (e.g. "Pankaj")
      const matchesMainName = title.includes(nameParts[0]) || snippet.includes(nameParts[0]);

      if (!matchesMainName) return;

      // Filter out Directory/Search results
      const isDirectory =
        /\d+\+? ["'].*["'] profiles/.test(title) ||
        title.includes("profiles |") ||
        title.includes("search results") ||
        link.includes("/pub/dir/") ||
        link.includes("/search/") ||
        snippet.includes("view the profiles of people named");
      if (isDirectory) return;

      // Filter out Noise (Unrelated content mentioning the name)
      const noisePatterns = [
        "photo by", "photograph by", "congratulations to", "congrats to",
        "proud of", "event", "album", "wedding of", "funeral of",
        "in memory of", "condolences", "article by"
      ];
      const isNoise = noisePatterns.some(ptn => title.includes(ptn) || snippet.includes(ptn));

      // If noise, check if context matches
      if (isNoise) {
        const contextParts = (context || "").toLowerCase().split(" ").filter(p => p.length > 2);
        const hasContext = contextParts.some(p => title.includes(p) || snippet.includes(p));
        if (!hasContext) return;
      }

      if (link.includes("linkedin.com")) provider = "LinkedIn";
      else if (link.includes("instagram.com")) provider = "Instagram";
      else if (link.includes("bumble.com")) provider = "Bumble";
      else if (link.includes("facebook.com")) provider = "Facebook";
      else if (link.includes("twitter.com") || link.includes("x.com")) provider = "Twitter/X";
      else if (link.includes("rocketreach.co")) provider = "RocketReach";

      internetResults.push({
        id: `google-${index}`,
        title: item.title,
        text: item.snippet,
        url: item.link,
        source: "Internet",
        provider: provider,
        type: "AUX",
        priority: 3,
        images: item.thumbnail ? [item.thumbnail] : []
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

  const finalRanked = rankResults(combined, query);

  // Save to Cache
  try {
    await SearchCache.create({ query: normQuery, type: "SEARCH", data: finalRanked });
  } catch (err) {
    // Ignore duplicate key errors silently
    if (err.code !== 11000) console.error("Cache save failed:", err);
  }

  return finalRanked;
}

import FormInfo from "../models/FormInfo.js";

// Main multi-search endpoint (Stage 2 - Baseline)
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

// New Identification endpoint (Stage 1)
router.post("/identify", async (req, res) => {
  const { name, location, keywords } = req.body;
  if (!name) return res.status(400).json({ error: "Name is required" });

  try {
    const normName = normalize(name);
    // Check Cache for Identification
    const cached = await SearchCache.findOne({ query: normName, type: "IDENTIFY" });
    if (cached) {
      console.log(`[CACHE HIT] Identify: "${normName}"`);
      return res.json(cached.data);
    }

    // Perform a broad search to gather context for AI
    const searchQuery = `${name} ${location || ""} ${keywords || ""}`.trim();
    const searchResults = await performSearch(searchQuery);

    // Call AI to identify candidates from results
    const identification = await identifyPeople({
      name,
      location,
      keywords,
      keywords,
      searchResults
    });

    // Save to Cache
    try {
      await SearchCache.create({ query: normName, type: "IDENTIFY", data: identification });
    } catch (err) {
      if (err.code !== 11000) console.error("Cache save failed:", err);
    }

    res.json(identification);
  } catch (err) {
    console.error("Identification failed:", err);
    res.status(500).json({ error: "Identification failed" });
  }
});

/**
 * Stage 2: DeepSearch - Aggregates image, social accounts, and articles.
 */
router.post("/deep", async (req, res) => {
  const { person } = req.body; // Expects { name, description, location }
  if (!person || !person.name) return res.status(400).json({ error: "Person data required" });

  try {
    const name = person.name;
    const profession = person.description;
    const location = person.location || "";

    // 1. Broad search for everything
    const baseQuery = `${name} ${profession} ${location}`.trim();
    const rawResults = await performSearch(baseQuery);

    // 2. Filter images - strict matching for profile-like thumbnails
    const images = rawResults
      .flatMap(r => r.images || [])
      .filter(img => img && !img.includes("gstatic")); // Filter out generic icons

    // 3. Extract social accounts
    const socialAccounts = rawResults
      .filter(r => r.source === "Internet" && r.provider !== "Google")
      .map(r => ({
        provider: r.provider,
        url: r.url,
        title: r.title
      }));

    // 4. Extract articles (news or blog posts)
    const articles = rawResults
      .filter(r => r.source === "Internet" && r.provider === "Google")
      .map(r => ({
        title: r.title,
        snippet: r.text,
        url: r.url
      }));

    res.json({
      person,
      photo: images[0] || null,
      socials: socialAccounts,
      articles: articles.slice(0, 5) // Limit to top 5 articles
    });
  } catch (err) {
    console.error("DeepSearch failed:", err);
    res.status(500).json({ error: "Deep search failed" });
  }
});

/**
 * Handle "Person not Found" feedback
 */
router.post("/forminfo", async (req, res) => {
  const { name, keyword, location } = req.body;
  if (!name || !keyword) return res.status(400).json({ error: "Name and Keyword are required" });

  try {
    const entry = new FormInfo({
      name,
      Keyword: keyword,
      Location: location || "none"
    });
    await entry.save();
    res.json({ message: "Information saved successfully", entry });
  } catch (err) {
    console.error("Failed to save FormInfo:", err);
    res.status(500).json({ error: "Failed to save information" });
  }
});

export default router;
