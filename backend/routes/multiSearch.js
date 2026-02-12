import express from "express";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import SearchCache from "../models/SearchCache.js";
import { sqliteSearch } from "../db/sqlite.js";
import axios from "axios";
import { identifyPeople } from "../services/aiService.js";
import { extractSocialAccounts } from "../services/socialMediaService.js";
import { parseSocialProfile } from "../services/socialProfileParser.js";

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
 * @param {string} query
 * @param {boolean} simpleMode - If true, does a broad Google search without social filters.
 */
export async function performSearch(query, simpleMode = false) {
    const normQuery = normalize(query);

    /* 
    // Check Cache
    const cacheType = simpleMode ? "SEARCH" : "SEARCH"; 
    const cached = await SearchCache.findOne({ query: normQuery, type: cacheType });
    if (cached) {
      console.log(`[CACHE HIT] ${cacheType}: "${normQuery}"`);
      return cached.data;
    }
    */

    // 1. Primary searches (Exact substring)
    // Extract just the name/keywords before site filters for local search and name parsing
    const localSearchQuery = query.split("(")[0].replace(/site:\S+/g, "").trim();
    const queryWords = localSearchQuery.split(" ").filter(w => w.length > 1);

    // Improved target name extraction: prefer first two words if they exist
    const targetName = queryWords.length >= 2 ? queryWords.slice(0, 2).join(" ") : queryWords[0] || localSearchQuery;
    const context = queryWords.length > 2 ? queryWords.slice(2).join(" ") : "";

    let mongoResults = [];
    try {
        mongoResults = await Document.find({
            text: { $regex: localSearchQuery, $options: "i" }
        }).lean();
    } catch (dbErr) {
        console.warn("[MongoDB] Search failed (check MONGO_URI):", dbErr.message);
    }

    let sqliteResults = await sqliteSearch(localSearchQuery);

    // 2. Fallback: Keyword search
    if (mongoResults.length === 0 && queryWords.length >= 2) {
        const nameGuess = queryWords.slice(0, 2).join(" ");
        mongoResults = await Document.find({
            text: { $regex: nameGuess, $options: "i" }
        }).lean();
    }

    // 3. Deeper Fallback
    if (mongoResults.length === 0 && queryWords.length > 0) {
        mongoResults = await Document.find({
            $and: queryWords.slice(0, 3).map(word => ({
                text: { $regex: word, $options: "i" }
            }))
        }).lean();
    }

    let internetQuery = query;
    if (sqliteResults && sqliteResults.length > 0) {
        const p = sqliteResults[0];
        const parts = (p.text || "").split(" - ");
        const rowName = parts[0]?.trim() || "";
        const rowTitle = parts.slice(1).join(" - ").trim() || "";
        internetQuery = `${rowName} ${rowTitle}`.trim() || query;
    }

    // REAL INTERNET SEARCH – SERPAPI
    let internetResults = [];
    try {
        let socialQuery = internetQuery;

        // STRICT SEARCH (Default): Apply filters for social profiles
        if (!simpleMode) {
            const profileSites = [
                "site:linkedin.com/in/",
                "site:instagram.com", "site:facebook.com",
                "site:twitter.com", "site:x.com", "site:crunchbase.com/person/"
            ].join(" OR ");
            socialQuery = `${internetQuery} (${profileSites})`.trim();
        } else {
            // SIMPLE SEARCH: Just text, maybe explicitly exclude some junk?
            // For now, raw query is best for "Simple Google Search"
            socialQuery = internetQuery;
        }

        const response = await axios.get("https://serpapi.com/search", {
            params: {
                q: socialQuery,
                engine: "google",
                api_key: process.env.SERPAPI_KEY,
                num: simpleMode ? 20 : 40 // Increased limits to show more candidates
            }
        });

        const results = response.data?.organic_results || [];

        console.log(`[SerpAPI] Mode: ${simpleMode ? "SIMPLE" : "DEEP"} | Goal: ${socialQuery}`);
        console.log(`[SerpAPI] Raw Results: ${results.length}`);

        results.forEach((item, index) => {
            let provider = "Google";
            const link = (item.link || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            const snippet = (item.snippet || "").toLowerCase();
            const rawTarget = targetName || "";
            const nameLower = rawTarget.toLowerCase().replace(/["']/g, ""); // Strip quotes for matching
            const titleLower = title.toLowerCase();
            const targetNameStr = targetName.toLowerCase();

            console.log(`[Loop] Result: "${title}" | Provider: ${provider}`);

            // 0. Provider Labeling (Before filters)
            if (link.includes("linkedin.com")) provider = "LinkedIn";
            else if (link.includes("instagram.com")) provider = "Instagram";
            else if (link.includes("bumble.com")) provider = "Bumble";
            else if (link.includes("facebook.com")) provider = "Facebook";
            else if (link.includes("twitter.com") || link.includes("x.com")) provider = "Twitter/X";
            else if (link.includes("rocketreach.co")) provider = "RocketReach";

            // FILTERS: Apply name consistency checks to ALL results
            const nameParts = nameLower.split(" ").filter(p => p.length > 1); // "ahmed", "khatri"

            // 1. Check for PRESENCE of name parts
            const hasFirstPart = title.includes(nameParts[0]);
            if (!hasFirstPart) {
                if (!snippet.includes(nameParts[0])) {
                    console.log(`[Filter] Dropped (Name Mismatch: '${nameParts[0]}'): ${title}`);
                    return;
                }
            }

            if (simpleMode) {
                const nameIndex = titleLower.indexOf(targetNameStr);

                if (nameIndex !== -1) {
                    const separators = ["-", "|", ":", ",", "·", "•", "(", ")", "[", "]", "@", " at ", " from ", " for ", " on "];

                    // --- PREFIX CHECK ---
                    if (nameIndex > 0) {
                        const preceedingText = titleLower.substring(0, nameIndex).trim();
                        const lastChar = preceedingText.slice(-1);

                        if (!separators.some(sep => sep.trim() === lastChar || preceedingText.endsWith(sep))) {
                            const allowedPrefixes = ["mr", "mr.", "dr", "dr.", "prof", "user", "member", "student", "about", "images", "photos", "profile", "view", "contact", "biography", "bio", "follow", "visit", "see", "meet"];
                            const wordsBefore = preceedingText.split(" ");
                            const wordBefore = wordsBefore[wordsBefore.length - 1];

                            if (wordBefore && !allowedPrefixes.includes(wordBefore) && isNaN(wordBefore) && provider === "Google") {
                                console.log(`[Filter] Dropped (Prefix '${wordBefore}'): ${title}`);
                                return;
                            }
                        }
                    }

                    // --- POSTFIX CHECK ---
                    const endIndex = nameIndex + targetNameStr.length;
                    if (endIndex < titleLower.length) {
                        const followingText = titleLower.substring(endIndex).trim();
                        const firstChar = followingText.charAt(0);

                        if (!separators.some(sep => sep.trim() === firstChar || followingText.startsWith(sep))) {
                            const allowedSuffixes = ["jr", "sr", "iii", "phd", "md", "profile", "contact", "info", "linkedin", "instagram", "facebook", "twitter", "defined", "wiki", "bio", "net", "org", "com", "official", "page", "account", "handle", "connect", "following"];
                            const wordsAfter = followingText.split(" ");
                            const wordAfter = wordsAfter[0];

                            if (wordAfter && !allowedSuffixes.includes(wordAfter) && isNaN(wordAfter) && wordAfter.length > 1 && provider === "Google") {
                                console.log(`[Filter] Dropped (Postfix '${wordAfter}'): ${title}`);
                                return;
                            }
                        }
                    }
                }

                // 3. Directory & Junk Filtering
                const isDirectory =
                    /\d+\+? ["'].*["'] profiles/.test(title) ||
                    title.includes("profiles |") ||
                    title.includes("search results") ||
                    title.includes("find people") ||
                    title.includes("people named") ||
                    title.includes("profiles of") ||
                    link.includes("/pub/dir/") ||
                    link.includes("/search/") ||
                    link.includes("linkedin.com/search/results/") ||
                    link.includes("linkedin.com/pub/dir/") ||
                    snippet.includes("view the profiles of people named") ||
                    snippet.includes("results found for");

                if (isDirectory) {
                    console.log(`[Filter] Dropped (Directory): ${title}`);
                    return;
                }

                const articleKeywords = [
                    'wants to', 'how to', 'facts about', 'things about',
                    'reasons why', 'ways to', 'tips for', 'guide to',
                    'everything you need to know', 'what you need to know',
                    'here\'s how', 'here\'s why', 'why you should',
                    'breaking:', 'news:', 'report:', 'exclusive:',
                    'interview:', 'says', 'announces', 'reveals',
                    'just now', 'today\'s', 'latest', 'find', 'results', 'profiles of'
                ];
                const isArticle = articleKeywords.some(keyword => title.includes(keyword) || snippet.includes(keyword));
                if (isArticle) {
                    console.log(`[Filter] Dropped (Article): ${title}`);
                    return;
                }

                const noisePatterns = ["photo by", "photograph by", "congratulations to", "congrats to", "proud of", "event", "album", "wedding of", "funeral of", "in memory of", "condolences", "article by"];
                const isNoise = noisePatterns.some(ptn => title.includes(ptn) || snippet.includes(ptn));
                if (isNoise) {
                    console.log(`[Filter] Dropped (Noise): ${title}`);
                    return;
                }
            }

            internetResults.push({
                id: `google-${index}`,
                title: item.title || "Untitled Result",
                text: item.snippet || "No description available",
                url: item.link || "",
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

    // Deduplication
    const internetMap = new Map();
    internetResults.forEach(item => {
        if (!item.url) return;
        const key = normalize(item.url);
        if (!internetMap.has(key)) internetMap.set(key, item);
    });
    const dedupedInternetResults = Array.from(internetMap.values());

    const localMap = new Map();
    [
        ...mongoResults.map(doc => ({ id: doc._id, text: doc.text, source: "MongoDB", type: "RECORD", priority: 2 })),
        ...sqliteResults.map(doc => ({
            id: doc.id,
            text: doc.text, // Already contains the name/title in correct format
            source: "SQLite",
            type: "PROFILE",
            priority: 1,
            images: [doc.image].filter(Boolean)
        }))
    ].forEach(item => {
        const key = normalize(item.text);
        if (!localMap.has(key)) localMap.set(key, item);
    });
    const dedupedLocalResults = Array.from(localMap.values());

    const combined = [...dedupedLocalResults, ...dedupedInternetResults];
    const finalRanked = rankResults(combined, query);

    /*
    // Save to Cache
    try {
      const cacheType = simpleMode ? "SEARCH" : "SEARCH";
      await SearchCache.create({ query: normQuery, type: cacheType, data: finalRanked });
    } catch (err) {
      if (err.code !== 11000) console.error("Cache save failed:", err);
    }
    */

    return finalRanked;
}

import FormInfo from "../models/FormInfo.js";

/**
 * Stage 1 & 2: Identification
 * Searches Local DB + Internet to find potential personas.
 * Prioritizes Local Data.
 */
router.post("/identify", async (req, res) => {
    console.log("[Identify] Endpoint Hit");
    const { name, location, keywords } = req.body;
    if (!name) {
        console.log("[Identify] Error: Name missing");
        return res.status(400).json({ error: "Name is required" });
    }

    try {
        console.log(`[Identify] Searching for: ${name} | Loc: ${location} | Keywords: ${keywords}`);

        // 1. Search Local Databases (Priority 1)
        const sqliteResults = sqliteSearch(name);
        console.log(`[Identify] SQLite Results: ${sqliteResults.length}`);
        let mongoResults = [];
        try {
            mongoResults = await Document.find({
                text: { $regex: name, $options: "i" }
            }).limit(10).lean();
        } catch (dbErr) {
            console.warn("[MongoDB] Identify failed (check MONGO_URI):", dbErr.message);
        }

        const localCandidates = [
            ...sqliteResults.map(p => {
                const parts = (p.text || "").split(" - ");
                const rowName = parts[0]?.trim() || "Unknown";
                const rowDesc = parts.slice(1).join(" - ").trim() || "No description available";

                return {
                    name: rowName,
                    description: rowDesc,
                    location: p.location || "Local Database",
                    confidence: "Verified",
                    source: "local",
                    url: p.url || "",
                    image: p.image
                };
            }),
            ...mongoResults.map(d => ({
                name: name, // Use searched name as fallback for Mongo docs
                description: d.text.substring(0, 150) + "...",
                location: "Internal Records",
                confidence: "Verified",
                source: "local",
                url: "",
                metadata: d
            }))
        ];

        // 2. Search Internet (Priority 2)
        const profileSites = [
            "site:linkedin.com/in/", "site:linkedin.com/pub/",
            "site:instagram.com", "site:facebook.com",
            "site:twitter.com", "site:x.com", "site:crunchbase.com/person/"
        ].join(" OR ");
        const internetQuery = `${name} ${location || ""} ${keywords || ""} (${profileSites})`.trim();

        const searchResults = await performSearch(internetQuery, true);

        // Use AI to identify candidates from internet results
        let internetCandidates = [];
        try {
            internetCandidates = await identifyPeople({
                name,
                location,
                keywords,
                searchResults
            });
        } catch (aiError) {
            console.warn("AI Identification failed, using manual fallback:", aiError.message);
            internetCandidates = (searchResults || []).filter(r => r && r.title).map(r => ({
                name: r.title.split(/[-|]/)[0].trim(),
                description: r.text || "No details available",
                location: r.provider || "Web",
                confidence: "High",
                source: "internet",
                url: r.url
            }));
        }

        // 3. Combine and Deduplicate (Favoring Local)
        const combined = [...localCandidates, ...internetCandidates];
        const dedupedMap = new Map();

        combined.forEach(c => {
            const normName = (c.name || "").toLowerCase().trim();
            const normUrl = (c.url || "").toLowerCase().trim();
            const key = normUrl ? `${normName}||${normUrl}` : normName;

            if (!dedupedMap.has(key)) {
                dedupedMap.set(key, c);
            } else {
                // If existing is internet and new is local, replace it
                const existing = dedupedMap.get(key);
                if (existing.source === "internet" && c.source === "local") {
                    dedupedMap.set(key, c);
                }
            }
        });

        const finalCandidates = Array.from(dedupedMap.values())
            .sort((a, b) => (a.source === "local" ? -1 : 1)); // Local first

        res.json(finalCandidates);
    } catch (err) {
        console.error("Identification failed:", err.stack || err);
        res.status(500).json({ error: "Identification failed" });
    }
});

/**
 * Stage 4: Targeted DeepSearch
 * Aggregates specific data for a locked identity.
 * Prioritizes Local Data.
 */
router.post("/deep", async (req, res) => {
    const { person } = req.body;
    if (!person || !person.name) return res.status(400).json({ error: "Person data required" });

    try {
        const name = person.name.split(/[-|]/)[0].trim();
        const url = person.url || "";
        const location = person.location || "";
        const profession = person.description || "";

        console.log(`[Deep Search] Target: ${name} | URL: ${url}`);

        // 1. Priority 1: Search Local Database
        const localResults = [];
        try {
            const sqliteMatch = sqliteSearch(name);
            const mongoMatch = await Document.find({ text: { $regex: name, $options: "i" } }).lean();

            localResults.push(...sqliteMatch.map(r => ({ ...r, source: "SQLite", priority: 1 })));
            localResults.push(...mongoMatch.map(r => ({ text: r.text, source: "MongoDB", priority: 1 })));
        } catch (e) {
            console.warn("Local search failed during deep dive:", e);
        }

        // 2. Priority 2: Dual Internet Search
        // Search 1: Social Specific (Finding Profile Cards)
        let socialQuery = `"${name}" (site:linkedin.com/in/ OR site:instagram.com OR site:facebook.com OR site:twitter.com)`;
        if (url && url.includes("linkedin.com/in/")) {
            const handle = url.split("/in/")[1]?.split("/")[0];
            if (handle) socialQuery += ` ${handle}`;
        }

        // Search 2: General Search (Finding Background, Articles, Mentions)
        const cleanLocation = (location && location.toLowerCase() !== "none") ? location : "";
        const cleanProfession = (profession && profession.toLowerCase() !== "none") ? profession.substring(0, 30) : "";
        let generalQuery = `"${name}" ${cleanLocation} ${cleanProfession}`.trim();

        console.log(`[Deep Search] Social Query: ${socialQuery}`);
        console.log(`[Deep Search] General Query: ${generalQuery}`);

        // Execute both searches simultaneously for speed and better coverage
        const [socialResults, generalResults] = await Promise.all([
            performSearch(socialQuery, false, name), // Pass name to filter correctly
            performSearch(generalQuery, true, name)  // Pass name to filter correctly
        ]);

        const rawInternet = [...socialResults, ...generalResults];

        // Filter results to ensure they belong to the selected person
        const targetName = name.replace(/^"|"$/g, ''); // Strip quotes from name if present
        const filteredInternet = rawInternet.filter(r => {
            if (r.source !== "Internet") return false;
            if (url && r.url.includes("linkedin.com") && !r.url.toLowerCase().includes(url.toLowerCase())) return false;
            return true;
        });

        // 3. Extraction logic
        const formattedForParser = filteredInternet.map(r => ({
            title: r.title,
            snippet: r.text,
            link: r.url
        }));

        const socialProfiles = formattedForParser
            .map(result => parseSocialProfile(result))
            .filter(p => p !== null);

        // Deduplicate socials
        const socialMap = new Map();
        socialProfiles.forEach(s => {
            const key = `${s.platform}-${s.username}`;
            if (!socialMap.has(key)) socialMap.set(key, s);
        });

        const images = [...new Set(filteredInternet.flatMap(r => r.images || []).filter(Boolean))];

        // ARTICLES/SOURCES: Include research results AND social profiles that didn't become cards
        const articles = filteredInternet
            .filter(r => {
                // Keep if it's NOT already in socialMap
                const isAlreadySocial = Array.from(socialMap.values()).some(s => r.url.toLowerCase().includes(s.url.toLowerCase()));
                return !isAlreadySocial;
            })
            .map(r => ({ title: r.title, snippet: r.text, url: r.url, provider: r.provider }));

        res.json({
            person: { ...person, name },
            localData: localResults,
            socials: Array.from(socialMap.values()),
            images: images.slice(0, 15),
            articles: articles.slice(0, 10),
            aiSummary: {
                available: false,
                message: "AI is currently not available"
            }
        });
    } catch (err) {
        console.error("Deep search failed:", err);
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
            keyword: keyword,
            location: location || ""
        });
        await entry.save();
        res.json({ message: "Information saved successfully", entry });
    } catch (err) {
        console.error("Failed to save FormInfo:", err);
        res.status(500).json({ error: "Failed to save information" });
    }
});

// Temporary endpoint to clear cache
router.post("/clear-cache", async (req, res) => {
    try {
        const result = await SearchCache.deleteMany({});
        console.log(`[ADMIN] Cache cleared: ${result.deletedCount} items`);
        res.json({ message: "Cache cleared", count: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
