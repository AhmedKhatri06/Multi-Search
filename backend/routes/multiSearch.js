import express from "express";
import dotenv from "dotenv";
import Document from "../models/Document.js";
import SearchCache from "../models/SearchCache.js";
import { sqliteSearch } from "../db/sqlite.js";

import axios from "axios";
import { identifyPeople } from "../services/aiService.js";
import { extractSocialAccounts } from "../services/socialMediaService.js";
import { parseSocialProfile } from "../services/socialProfileParser.js";
import { detectInputType, normalizePhoneNumber, extractContacts } from "../utils/searchHelper.js";
import { searchCSVs } from "../services/csvSearchService.js";
import { searchImages } from "../services/internetSearch.js";
import FormInfo from "../models/FormInfo.js";

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

    let sqliteResults = sqliteSearch(localSearchQuery);

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

        const response = await axios.post("https://google.serper.dev/search", {
            q: socialQuery,
            num: simpleMode ? 20 : 40
        }, {
            headers: {
                "X-API-KEY": process.env.SERPER_API_KEY,
                "Content-Type": "application/json"
            }
        });

        const results = response.data?.organic || [];

        console.log(`[Serper.dev] Mode: ${simpleMode ? "SIMPLE" : "DEEP"} | Goal: ${socialQuery}`);
        console.log(`[Serper.dev] Raw Results: ${results.length}`);

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
                images: item.imageUrl ? [item.imageUrl] : []
            });
        });
    } catch (err) {
        console.error("Serper.dev search failed:", err.message);
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



/**
 * Stage 1 & 2: Identification
 * Searches Local DB + Internet to find potential personas.
 * Prioritizes Local Data.
 */
router.post("/identify", async (req, res) => {
    console.log("[Identify] Endpoint Hit");
    const { name, location, keywords, number } = req.body;
    if (!name) {
        return res.status(400).json({ error: "Search query is required" });
    }

    try {
        const inputType = detectInputType(name);
        console.log(`[Identify] Detected Type: ${inputType} | Query: ${name} | Keyword: ${keywords} | Number: ${number}`);

        // 1. Search Local Sources (Priority 1)
        // If 'number' is provided, we prioritize searching by that in local DBs
        const searchQuery = number || name;
        const searchType = number ? "PHONE" : inputType;

        const csvResults = await searchCSVs(searchQuery, searchType);
        const { sqliteSearch: internalSqliteSearch } = await import("../db/sqlite.js");
        const sqliteResults = internalSqliteSearch(searchQuery);

        let mongoResults = [];
        try {
            mongoResults = await Document.find({
                text: { $regex: searchQuery, $options: "i" }
            }).limit(10).lean();
        } catch (dbErr) {
            console.warn("[MongoDB] Identify failed:", dbErr.message);
        }

        // Map local data to a common candidate structure
        const localCandidates = [
            ...csvResults.map(r => ({
                name: r.name + (keywords ? ` ${keywords}` : ""),
                description: r.description || "Identified in CSV Archive",
                location: r.location || "Archives",
                confidence: "Verified",
                source: "local",
                url: "",
                image: r.image,
                phoneNumbers: r.phoneNumbers,
                email: r.email,
                keywordMatched: keywords || ""
            })),
            ...sqliteResults.map(p => {
                const parts = (p.text || "").split(" - ");
                const baseName = parts[0]?.trim() || "Unknown";
                return {
                    name: baseName + (keywords ? ` ${keywords}` : ""),
                    description: parts.slice(1).join(" - ").trim() || "Identity SQL Record",
                    location: p.location || "Identity SQL",
                    confidence: "Verified",
                    source: "local",
                    url: p.url || "",
                    image: p.image,
                    phoneNumbers: p.phone ? [p.phone] : [],
                    email: p.email || "",
                    keywordMatched: keywords || ""
                };
            }),
            ...mongoResults.map(d => ({
                name: (inputType === "PHONE" ? "Potential Lead" : name) + (keywords ? ` ${keywords}` : ""),
                description: d.text.substring(0, 150) + "...",
                location: "Cluster DB Archives",
                confidence: "Verified",
                source: "local",
                url: "",
                email: d.email || "",
                metadata: d,
                keywordMatched: keywords || ""
            }))
        ];

        // 2. Search Internet (Always attempt to find web identities)
        let internetCandidates = [];
        let internetQuery = "";
        if (inputType === "NAME") {
            const profileSites = [
                "site:linkedin.com/in/", "site:instagram.com", "site:facebook.com",
                "site:twitter.com", "site:x.com", "site:crunchbase.com/person/"
            ].join(" OR ");
            internetQuery = `${name} ${location || ""} ${keywords || ""} (${profileSites})`.trim();
        } else {
            // PHONE search - look for the number itself on the web
            internetQuery = `"${name}" OR "${normalizePhoneNumber(name)}"`;
        }

        let searchResults = await performSearch(internetQuery, true);

        // Fallback: If no results for filtered search, try simple search
        if ((!searchResults || searchResults.length === 0) && inputType === "NAME") {
            console.log("[Identify] Filtered search yielded no results, falling back to simple search.");
            const simpleQuery = `${name} ${location || ""} ${keywords || ""}`.trim();
            searchResults = await performSearch(simpleQuery, true);
        }

        if (searchResults && searchResults.length > 0) {
            try {
                internetCandidates = (await identifyPeople({
                    name,
                    location,
                    keywords,
                    searchResults
                })).map(c => {
                    // Check if name already contains the keywords to avoid "Name Keyword Keyword"
                    const cName = c.name || "";
                    const hasKeyword = keywords && cName.toLowerCase().includes(keywords.toLowerCase());
                    return {
                        ...c,
                        source: "internet",
                        name: hasKeyword ? cName : cName + (keywords ? ` - ${keywords}` : ""),
                        keywordMatched: keywords || ""
                    };
                });

                // If AI finds nothing but we have results, provide raw results as fallback
                if ((!internetCandidates || internetCandidates.length === 0)) {
                    internetCandidates = searchResults.map(r => ({
                        name: r.title.split(/[-|]/)[0].trim() + (keywords ? ` ${keywords}` : ""),
                        description: r.text || "Web result",
                        location: r.provider || "Internet",
                        confidence: "Medium",
                        source: "internet",
                        url: r.url,
                        keywordMatched: keywords || ""
                    }));
                }
            } catch (aiError) {
                console.error("[Identify] AI Identification error:", aiError.message);
                internetCandidates = (searchResults || []).filter(r => r && r.title).map(r => {
                    const title = r.title.split(/[-|]/)[0].trim();
                    const hasKeyword = keywords && title.toLowerCase().includes(keywords.toLowerCase());
                    return {
                        name: hasKeyword ? title : title + (keywords ? ` ${keywords}` : ""),
                        description: r.text || "No details available",
                        location: r.provider || "Web",
                        confidence: "High",
                        source: "internet",
                        url: r.url,
                        keywordMatched: keywords || ""
                    };
                });
            }
        }

        // 3. Combine and Deduplicate
        const combined = [...localCandidates, ...internetCandidates];
        const dedupedMap = new Map();

        // Check for Direct Resolve (Phone searches with unique local matches)
        let directResolve = false;
        let resolvedPersona = null;

        if (inputType === "PHONE" && localCandidates.length === 1) {
            console.log(`[Identify] Direct Resolution Triggered for: ${localCandidates[0].name}`);
            directResolve = true;
            resolvedPersona = localCandidates[0];
        }

        combined.forEach(c => {
            const normName = (c.name || "").toLowerCase().trim();
            const normUrl = (c.url || "").toLowerCase().trim();
            const key = normUrl ? `${normName}||${normUrl}` : normName;

            if (!dedupedMap.has(key)) {
                dedupedMap.set(key, c);
            } else {
                const existing = dedupedMap.get(key);
                if (existing.source === "internet" && c.source === "local") {
                    dedupedMap.set(key, c);
                }
            }
        });

        const finalCandidates = Array.from(dedupedMap.values())
            .sort((a, b) => {
                if (a.source === "local" && b.source !== "local") return -1;
                if (a.source !== "local" && b.source === "local") return 1;
                return 0;
            });

        res.json({
            candidates: finalCandidates,
            directResolve: directResolve,
            personaName: resolvedPersona ? resolvedPersona.name : null,
            resolvedPersona: resolvedPersona
        });
    } catch (err) {
        console.error("Identification failed:", err);
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

    // Clean name and keyword
    // The name might contain metadata like "Ahmed Khatri Student" or "Name - Keyword"
    let name = person.name || "";
    let keyword = person.keywordMatched || "";

    // If name contains a separator, split it
    if (name.includes(" - ")) {
        const parts = name.split(" - ");
        name = parts[0].trim();
        if (!keyword) keyword = parts[1].trim();
    } else if (name.includes(" | ")) {
        const parts = name.split(" | ");
        name = parts[0].trim();
        if (!keyword) keyword = parts[1].trim();
    }

    // Deduplicate: If the name ends with the same words as the keyword, trim the name
    const nameLower = name.toLowerCase();
    const keywordLower = keyword.toLowerCase();
    if (keywordLower && nameLower.endsWith(" " + keywordLower)) {
        name = name.substring(0, name.length - (keyword.length + 1)).trim();
    } else if (keywordLower && nameLower.includes(keywordLower)) {
        // More aggressive: if the keyword is anywhere in the name, try to extract just the first two words as the base name
        const nameParts = name.split(' ');
        if (nameParts.length > 2) {
            name = `${nameParts[0]} ${nameParts[1]}`;
        }
    }

    // Scrub common "junk" descriptions from professions/location
    const scrub = (str) => {
        if (!str) return "";
        const junk = ["local profile found", "local records", "verified", "high accuracy", "no description", "none", "database", "datastore"];
        let s = str.toLowerCase();
        for (const j of junk) {
            if (s.includes(j)) return "";
        }
        return str;
    };

    const location = scrub(person.location || "");
    const profession = scrub(person.description || "");

    console.log(`[Deep Search] Target: ${name} | Keyword: ${keyword} | Location: ${location}`);

    try {
        // 1. Priority 1: Search Local Database & CSVs with Fuzzy Matching
        const localResults = [];
        const localPhones = new Set();
        const localEmails = new Set();

        // Extract a fuzzy search term (e.g., first two names) to catch records like "Ahmed Khatri Student"
        const nameParts = name.split(' ');
        const fuzzyName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[1]}` : name;

        try {
            // Search with both specific and fuzzy names
            const sqliteMatch = [...sqliteSearch(name), ...sqliteSearch(fuzzyName)];
            const mongoMatch = await Document.find({
                $or: [
                    { text: { $regex: name, $options: "i" } },
                    { text: { $regex: fuzzyName, $options: "i" } }
                ]
            }).lean();
            const csvMatch = [...(await searchCSVs(name, "NAME")), ...(await searchCSVs(fuzzyName, "NAME"))];

            // Deduplicate local results by text
            const uniqueLocal = new Map();
            [...sqliteMatch, ...mongoMatch, ...csvMatch].forEach(r => {
                const txt = (r.text || r.description || "").toLowerCase().trim();
                if (!uniqueLocal.has(txt)) {
                    uniqueLocal.set(txt, {
                        text: r.text || r.description || r.name,
                        source: r.source || (r.text ? "MongoDB" : "Local"),
                        priority: 1
                    });
                }
            });

            localResults.push(...uniqueLocal.values());

            // Extract phones/emails
            csvMatch.forEach(r => {
                if (r.phoneNumbers) r.phoneNumbers.forEach(p => localPhones.add(p));
                if (r.email) localEmails.add(r.email.toLowerCase().trim());
                if (r.emails) r.emails.forEach(e => localEmails.add(e.toLowerCase().trim()));
            });
            sqliteMatch.forEach(p => {
                if (p.phone) localPhones.add(normalizePhoneNumber(p.phone));
                if (p.email) localEmails.add(p.email.toLowerCase().trim());
            });
        } catch (e) {
            console.warn("Local search failed during deep dive:", e);
        }

        // 2. Multi-Sweep Internet Search
        const cleanLocation = (location && location.toLowerCase() !== "none" && !location.toLowerCase().includes("records") && !location.toLowerCase().includes("datastore")) ? location : "";
        const cleanProfession = (profession && profession.toLowerCase() !== "none") ? profession.substring(0, 50) : "";

        // Query 1: Targeted Social Sweep (Search name + keyword)
        const hasK = keyword && name.toLowerCase().includes(keyword.toLowerCase());
        const cleanSearchTerm = hasK ? name : `${name} ${keyword}`.trim();

        const socialQuery = `"${name}" ${hasK ? "" : keyword} (site:linkedin.com/in/ OR site:github.com OR site:twitter.com OR site:instagram.com OR site:facebook.com)`.trim();

        // Query 2: Broad Context Sweep (Contacts/Emails focus)
        // Use truncated profession (cleanProfession) to avoid 400 errors from giant paragraph queries
        const contextKeywords = keyword || cleanProfession || "profile OR bio OR contact";
        const contextQuery = `"${name}" ${cleanLocation} ${contextKeywords}`.trim();

        // Query 3: Image Sweep (Search name + photo) - Added cleanProfession for disambiguation
        const imageQuery = `"${name}" ${cleanProfession} "profile picture" OR "portrait"`.trim();
        const fallbackImageQuery = `"${name}" ${cleanProfession} headshot`.trim();

        const [socialResults, contextResults, initialImageResults] = await Promise.all([
            performSearch(socialQuery, true),
            performSearch(contextQuery, true),
            searchImages(imageQuery, name, cleanProfession)
        ]);

        let finalImageResults = initialImageResults;
        if (finalImageResults.length === 0) {
            console.log("[Deep Search] Image search returned 0, attempting fallback...");
            finalImageResults = await searchImages(fallbackImageQuery, name, cleanProfession);
        }

        const allSearchItems = [...socialResults, ...contextResults];

        // 3. Robust Social Discovery using specialized service
        const queryWords = name.split(' ');
        const socialProfiles = extractSocialAccounts(allSearchItems, name, queryWords, cleanLocation);
        console.log(`[Deep Search] Social profiles found: ${socialProfiles.length}`);
        socialProfiles.forEach(s => console.log(`  → ${s.platform}: ${s.username} (${s.url}) [score: ${s.identityScore}]`));

        // 4. Extract Contacts
        const webPhones = new Set();
        const webEmails = new Set();
        allSearchItems.forEach(r => {
            const extracted = extractContacts(r.text);
            extracted.phones.forEach(p => webPhones.add(p));
            extracted.emails.forEach(e => webEmails.add(e));
        });

        // 5. Image Ranking & Selection
        // Try to find a primary image (LinkedIn usually has the best)
        const linkedInProfile = socialProfiles.find(s => s.platform.toLowerCase() === 'linkedin');
        let primaryImage = person.image || "";

        if (!primaryImage && linkedInProfile) {
            // Find the search result associated with this LinkedIn URL to get its thumbnail
            const liResult = socialResults.find(r => r.url.toLowerCase().includes(linkedInProfile.url.toLowerCase()));
            if (liResult && liResult.images && liResult.images.length > 0) {
                primaryImage = liResult.images[0];
            }
        }

        const allImages = [
            primaryImage,
            ...(finalImageResults.map(img => img.imageUrl)),
            ...(allSearchItems.flatMap(r => r.images || []))
        ].filter(Boolean);

        // Deduplicate and slice images
        const uniqueImages = [...new Set(allImages)].slice(0, 20);

        // 6. Article Extraction (excluding results identified as social)
        const socialUrls = new Set(socialProfiles.map(s => s.url.toLowerCase()));
        const articles = allSearchItems
            .filter(r => !socialUrls.has(r.url.toLowerCase()))
            .map(r => ({ title: r.title, snippet: r.text, url: r.url, provider: r.provider }))
            .slice(0, 15);

        res.json({
            person: {
                ...person,
                name,
                primaryImage: primaryImage || uniqueImages[0] || "",
                phoneNumbers: [...new Set([...localPhones, ...webPhones])],
                emails: [...new Set([...localEmails, ...webEmails])]
            },
            localData: localResults,
            socials: socialProfiles,
            images: uniqueImages,
            articles: articles
        });
    }
    catch (err) {
        console.error("Deep search failed:", err);
        res.status(500).json({ error: "Deep search failed" });
    }
});


// Feedback and cache management (Keep existing)
router.post("/forminfo", async (req, res) => {
    const { name, keyword, location } = req.body;
    if (!name || !keyword) return res.status(400).json({ error: "Name and Keyword are required" });
    try {
        const entry = new FormInfo({ name, keyword, location: location || "" });
        await entry.save();
        res.json({ message: "Information saved successfully", entry });
    } catch (err) {
        res.status(500).json({ error: "Failed to save information" });
    }
});

router.post("/clear-cache", async (req, res) => {
    try {
        const result = await SearchCache.deleteMany({});
        res.json({ message: "Cache cleared", count: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
