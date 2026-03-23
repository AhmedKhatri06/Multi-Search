import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import FormInfo from "../models/FormInfo.js";
import SearchCache from "../models/SearchCache.js";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";
import { identifyPeople, generateText, verifyIdentityMatch } from "../services/aiService.js";
import { extractSocialAccounts, supportedPlatformDomains } from "../services/socialMediaService.js";
import { parseSocialProfile } from "../services/socialProfileParser.js";
import { detectInputType, normalizePhoneNumber, extractContacts, normalizeName } from "../utils/searchHelper.js";
import { searchCSVs } from "../services/csvSearchService.js";
import { searchImages, calculateImageScore, searchWithDorks } from "../services/internetSearch.js";
import { verifyFaceSimilarity, detectHumanFace, batchWithPacing } from "../services/faceVerificationService.js";
import { generateDorks, generatePivotDorks, generateDocumentDorks } from "../services/dorkingService.js";

dotenv.config();

const router = express.Router();

// Helper to normalize image URLs and handle blocked proxies
const normalizeImageUrl = (url, thumbnail) => {
    if (!url) return null;

    // Normalize malformed strings like x-raw-image:///
    let normalized = url;
    if (url.startsWith('x-raw-image:///')) {
        // Strip prefix, check if the remaining part looks like an absolute URL elsewhere, 
        // but usually these are non-renderable raw refs. Fallback to thumbnail immediately.
        return thumbnail || null;
    }

    // Identify blocked domains that need thumbnail preference
    const blockedDomains = ['instagram.com', 'fbcdn.net', 'facebook.com', 'pinterest.com'];
    const isBlocked = blockedDomains.some(d => url.includes(d));

    // Support data URLs
    if (url.startsWith('data:')) {
        return { original: url, thumbnail: url, isBlocked: false };
    }

    return {
        original: normalized,
        thumbnail: thumbnail || normalized,
        isBlocked: isBlocked || url === thumbnail // If original and thumb are same, it might be a single-source thumb
    };
};

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

/**
 * Perform a direct query to Wikipedia OpenSearch API to find a relevant page
 * @param {string} query 
 * @returns {Object|null} Social profile object for Wikipedia or null
 */
export async function searchWikipedia(query) {
    if (!query) return null;
    try {
        const response = await axios.get(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`);
        const data = response.data;
        if (data && data[1] && data[1].length > 0 && data[3] && data[3].length > 0) {
            const title = data[1][0];
            const url = data[3][0];
            return {
                platform: 'Wikipedia',
                url: url,
                username: title,
                handle: title,
                confidence: 'high',
                identityScore: 100,
                source: 'Wikipedia API'
            };
        }
    } catch (err) {
        console.error("[Deep Search] Wikipedia API fetch failed:", err.message);
    }
    return null;
}

export async function performSearch(query, simpleMode = false) {
    const normQuery = normalize(query);

    /* 
    // Check Cache
    const cacheType = simpleMode ? "SEARCH" : "SEARCH"; 
    const cached = await SearchCache.findOne({ query: normQuery, type: cacheType });
    if (cached) {
      console.log(`[CACHE HIT] ${ cacheType }: "${normQuery}"`);
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
        internetQuery = `${rowName} ${rowTitle} `.trim() || query;
    }

    // REAL INTERNET SEARCH – SERPAPI
    let internetResults = [];
    try {
        let socialQuery = internetQuery;

        // STRICT SEARCH (Default): Apply filters for social profiles
        if (!simpleMode) {
            const socialSitesFilter = supportedPlatformDomains.map(d => `site:${d}`).join(" OR ");
            socialQuery = `${internetQuery} (${socialSitesFilter})`.trim();
        } else {
            // SIMPLE SEARCH: Just text, maybe explicitly exclude some junk?
            // For now, raw query is best for "Simple Google Search"
            socialQuery = internetQuery;
        }

        console.time(`[Serper] Request: ${socialQuery.slice(0, 30)}...`);
        const response = await axios.post("https://google.serper.dev/search", {
            q: socialQuery,
            num: simpleMode ? 20 : 40
        }, {
            headers: {
                "X-API-KEY": process.env.SERPER_API_KEY,
                "Content-Type": "application/json"
            },
            timeout: 15000 // 15s timeout
        });
        console.timeEnd(`[Serper] Request: ${socialQuery.slice(0, 30)}...`);

        const results = response.data?.organic || [];

        console.log(`[Serper.dev] Mode: ${simpleMode ? "SIMPLE" : "DEEP"} | Goal: ${socialQuery} `);
        console.log(`[Serper.dev] Raw Results: ${results.length} `);

        results.forEach((item, index) => {
            let provider = "Google";
            const link = (item.link || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            const snippet = (item.snippet || "").toLowerCase();
            const rawTarget = targetName || "";
            const nameLower = rawTarget.toLowerCase().replace(/["']/g, ""); // Strip quotes for matching
            const titleLower = title.toLowerCase();
            const targetNameStr = targetName.toLowerCase();

            console.log(`[Loop] Result: "${title}" | Provider: ${provider} `);

            // 0. Provider Labeling (Before filters)
            if (link.includes("linkedin.com")) provider = "LinkedIn";
            else if (link.includes("instagram.com")) provider = "Instagram";
            else if (link.includes("bumble.com")) provider = "Bumble";
            else if (link.includes("facebook.com")) provider = "Facebook";
            else if (link.includes("twitter.com") || link.includes("x.com")) provider = "Twitter/X";
            else if (link.includes("rocketreach.co")) provider = "RocketReach";
            else if (link.includes("wikipedia.org")) provider = "Wikipedia";
            else if (link.includes("imdb.com")) provider = "IMDb";
            else if (link.includes("britannica.com")) provider = "Britannica";

            // FILTERS: Apply name consistency checks to ALL results
            const nameParts = nameLower.split(" ").filter(p => p.length > 1); // "ahmed", "khatri"

            // 1. Check for PRESENCE of name parts
            const hasFirstPart = title.includes(nameParts[0]);
            if (!hasFirstPart) {
                if (!snippet.includes(nameParts[0])) {
                    console.log(`[Filter] Dropped(Name Mismatch: '${nameParts[0]}'): ${title} `);
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
                                console.log(`[Filter] Dropped(Prefix '${wordBefore}'): ${title} `);
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
                                console.log(`[Filter] Dropped(Postfix '${wordAfter}'): ${title} `);
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
                    console.log(`[Filter] Dropped(Directory): ${title} `);
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
                    console.log(`[Filter] Dropped(Article): ${title} `);
                    return;
                }

                const noisePatterns = ["photo by", "photograph by", "congratulations to", "congrats to", "proud of", "event", "album", "wedding of", "funeral of", "in memory of", "condolences", "article by"];
                const isNoise = noisePatterns.some(ptn => title.includes(ptn) || snippet.includes(ptn));
                if (isNoise) {
                    console.log(`[Filter] Dropped(Noise): ${title} `);
                    return;
                }
                const knowledgeDomains = ['wikipedia.org', 'imdb.com/name', 'britannica.com', 'biography.com'];
                const isKnowledge = knowledgeDomains.some(d => link.includes(d));
                
                if (isKnowledge) {
                    internetResults.push({
                        id: `knowledge-${index}`,
                        title: item.title || "Untitled Result",
                        text: item.snippet || "No description available",
                        url: item.link || "",
                        source: "KnowledgeBase",
                        provider: provider,
                        type: "KNOWLEDGE",
                        priority: 0, // Top priority
                        images: item.imageUrl ? [item.imageUrl] : []
                    });
                    return;
                }
            }

            internetResults.push({
                id: `google - ${index} `,
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

    const normQuery = normalize(name + (location || "") + (keywords || "") + (number || ""));

    try {
        // Cache Check
        const cached = await SearchCache.findOne({ query: normQuery, type: "IDENTIFY" });
        if (cached) {
            console.log(`[Identify] Cache Hit: ${name}`);
            return res.json(cached.data);
        }
        const inputType = detectInputType(name);
        console.log(`[Identify] Detected Type: ${inputType} | Query: ${name} | Keyword: ${keywords} | Number: ${number} `);

        const searchQuery = number || name;
        const searchType = number ? "PHONE" : inputType;

        // Prepare internet query early constraint
        let internetQuery = "";
        if (inputType === "NAME") {
            const profileSites = [
                "site:linkedin.com/in/", "site:instagram.com", "site:facebook.com",
                "site:twitter.com", "site:x.com", "site:crunchbase.com/person/", 
                "site:en.wikipedia.org", "site:imdb.com/name/"
            ].join(" OR ");
            internetQuery = `${name} ${location || ""} ${keywords || ""} (${profileSites})`.trim();
        } else {
            internetQuery = `"${name}" OR "${normalizePhoneNumber(name)}"`;
        }

        console.log(`[Identify] Executing parallel searches for: ${searchQuery}`);

        // 1. Parallel execution for local storage and internet
        const [csvResults, sqliteResults, dbResults, internetRes] = await Promise.all([
            searchCSVs(searchQuery, searchType).catch(e => { console.error("[CSV] err:", e.message); return []; }),
            Promise.resolve().then(() => sqliteSearch(searchQuery)).catch(e => { console.error("[SQLite] err:", e.message); return []; }),
            Document.find({ text: { $regex: searchQuery, $options: "i" } }).limit(10).lean().catch(e => { console.warn("[MongoDB] Identify failed:", e.message); return []; }),
            (async () => {
                let sRes = await performSearch(internetQuery, true).catch(e => []);
                
                // Broaden search if very few results found for a likely high-profile name
                if ((!sRes || sRes.length < 5) && inputType === "NAME") {
                    console.log(`[Identify] Few dorked results (${sRes?.length}). Triggering broad sweep fallback.`);
                    const broadQuery = `${name} profile biography official site`;
                    const broadRes = await performSearch(broadQuery, true).catch(e => []);
                    sRes = [...(sRes || []), ...(broadRes || [])];
                }
                return sRes;
            })()
        ]);

        console.log(`[Identify] Results -> CSV: ${csvResults?.length || 0} | SQLite: ${sqliteResults?.length || 0} | Mongo: ${dbResults?.length || 0} | Internet: ${internetRes?.length || 0}`);

        let mongoResults = dbResults || [];
        let searchResults = internetRes || [];
        let internetCandidates = [];

        // Map local data to a common candidate structure
        const localCandidates = [
            ...csvResults.map(r => ({
                name: r.name,
                description: r.description || "Identified in CSV Archive",
                location: r.location || "Archives",
                company: r.company || r.CompanyName || keywords || "",
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
                const baseName = p.name || parts[0]?.trim() || "Unknown";
                return {
                    name: baseName,
                    description: p.title || p.description || parts.slice(1).join(" - ").trim() || "Identity SQL Record",
                    location: p.location || "Identity SQL",
                    company: p.company || keywords || "",
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
                name: (inputType === "PHONE" ? "Potential Lead" : name),
                description: d.text.substring(0, 150) + "...",
                location: "Cluster DB Archives",
                company: d.company || keywords || "",
                confidence: "Verified",
                source: "local",
                url: "",
                email: d.email || "",
                metadata: d,
                keywordMatched: keywords || ""
            }))
        ];

        // NEW: Explicitly extract Knowledge Base candidates to ensure they aren't lost in AI filters
        const knowledgeCandidates = searchResults
            .filter(r => r.type === "KNOWLEDGE")
            .map(r => ({
                name: r.title.split(/[-|]/)[0].trim(),
                description: r.text || "Verified Knowledge Base Entry",
                location: r.provider || "Public Record",
                company: "Knowledge Base",
                confidence: "Verified",
                source: "internet",
                type: "knowledge",
                url: r.url,
                keywordMatched: keywords || ""
            }));

        console.time("[AI] Identification Phase");
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
                        name: hasKeyword ? cName : cName + (keywords ? ` - ${keywords} ` : ""),
                        keywordMatched: keywords || ""
                    };
                });

                // If AI finds nothing but we have results, provide raw results as fallback
                if ((!internetCandidates || internetCandidates.length === 0)) {
                    internetCandidates = searchResults.map(r => ({
                        name: r.title.split(/[-|]/)[0].trim() + (keywords ? ` ${keywords} ` : ""),
                        description: r.text || "Web result",
                        location: r.provider || "Internet",
                        company: keywords || "", // Added company field
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
                        name: hasKeyword ? title : title + (keywords ? ` ${keywords} ` : ""),
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
        console.timeEnd("[AI] Identification Phase");

        // 3. Combine and Deduplicate (Robust Entity Resolution)
        // Prioritize: Local > KnowledgeBase > InternetAI
        const combined = [...localCandidates, ...knowledgeCandidates, ...internetCandidates];
        const mergedIdentities = new Map();

        combined.forEach(candidate => {
            const rawName = candidate.name || "Unknown";
            const normName = normalizeName(rawName);
            const normCompany = (candidate.company || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");

            // Composite Key: Name + Company (Robust enough)
            const compositeKey = `${normName}|${normCompany}`;

            // Fuzzy search for existing identity
            let existingKey = null;
            for (const [key, existing] of mergedIdentities.entries()) {
                const [existingNormName, existingNormCompany] = key.split('|');

                const nameMatch = existingNormName === normName;

                // FUZZY COMPANY MATCH: 
                // Matches if exact, or if one is a substantial substring of the other (min 3 chars)
                const companyMatch = (normCompany && existingNormCompany) &&
                    (existingNormCompany.includes(normCompany) || normCompany.includes(existingNormCompany)) &&
                    (normCompany.length >= 3 || existingNormCompany.length >= 3);

                const candidateEmails = candidate.email ? [candidate.email] : (candidate.emails || []);
                const candidatePhones = candidate.phoneNumbers || (candidate.phone ? [candidate.phone] : []);

                const sharedEmail = candidateEmails.some(e => existing.emails.includes(e));
                const sharedPhone = candidatePhones.some(p => existing.phoneNumbers.includes(p));

                // Merge if:
                // 1. Name matches AND (Company matches OR Shared Contacts)
                if (nameMatch && (companyMatch || sharedEmail || sharedPhone)) {
                    existingKey = key;
                    break;
                }
            }

            if (!existingKey) {
                mergedIdentities.set(compositeKey, {
                    ...candidate,
                    otherSources: candidate.source ? [candidate.source] : [],
                    phoneNumbers: candidate.phoneNumbers || (candidate.phone ? [candidate.phone] : []),
                    emails: candidate.email ? [candidate.email] : (candidate.emails || []),
                    socials: candidate.url && candidate.source === "internet" ? [{ platform: 'Web', url: candidate.url }] : []
                });
            } else {
                const existing = mergedIdentities.get(existingKey);
                if (existing.source !== "local" && candidate.source === "local") {
                    existing.name = candidate.name;
                    existing.description = candidate.description || existing.description;
                    existing.location = candidate.location || existing.location;
                    existing.source = "local";
                }

                // Merge identifiers
                existing.phoneNumbers = [...new Set([...(existing.phoneNumbers || []), ...(candidate.phoneNumbers || []), ...(candidate.phone ? [candidate.phone] : [])])];
                existing.emails = [...new Set([...(existing.emails || []), ...(candidate.emails || []), ...(candidate.email ? [candidate.email] : [])])];

                // Aggregate socials/URLs correctly
                if (!existing.socials) existing.socials = [];
                if (candidate.socials) {
                    candidate.socials.forEach(s => {
                        if (!existing.socials.find(es => es.url === s.url)) {
                            existing.socials.push(s);
                        }
                    });
                }
                if (candidate.url && !existing.socials.find(s => s.url === candidate.url)) {
                    existing.socials.push({ platform: "Web", url: candidate.url });
                }

                if (candidate.source && !existing.otherSources.includes(candidate.source)) {
                    existing.otherSources.push(candidate.source);
                }
            }
        });

        // Check for Direct Resolve (Phone searches with unique local matches)
        let directResolve = false;
        let resolvedPersona = null;

        if (inputType === "PHONE" && localCandidates.length === 1) {
            console.log(`[Identify] Direct Resolution Triggered for: ${localCandidates[0].name} `);
            directResolve = true;
            resolvedPersona = localCandidates[0];
        }

        // --- POST FILTER: Remove social media posts/statuses from candidate list ---
        const postUrlPatterns = [
            /\/posts\//i,
            /\/status\//i,
            /\/p\//i,
            /story\.php/i,
            /\/reel\//i,
            /\/watch\//i
        ];
        const postTitlePatterns = [
            /\/ posts \/ x$/i,
            /\/ posts$/i,
            /on facebook$/i,
            /on twitter$/i,
            /on instagram$/i,
            /posted on/i,
            /shared a post/i,
            /\(@\w+\) \/ posts/i  // e.g. "mihir doshi (@mihirdoshi) / Posts / X"
        ];

        // ADDED: List of specific sites to build the dynamic query
        const socialSitesFilter = supportedPlatformDomains.map(d => `site:${d}`).join(" OR ");

        const isPostCandidate = (candidate) => {
            // Never filter local candidates
            if (candidate.source === "local") return false;

            const url = (candidate.url || "").toLowerCase();
            const title = (candidate.name || "").toLowerCase();
            const desc = (candidate.description || "").toLowerCase();

            // 1. Check URL patterns (Strongest indicator of a post)
            if (postUrlPatterns.some(pattern => pattern.test(url))) {
                console.log(`[Filter] Removed as post URL: ${candidate.name} | ${url}`);
                return true;
            }

            // 2. Profile Exemption: If it looks like a main profile URL, don't filter it by title keywords
            const isMainProfile = url.includes("linkedin.com/in/") || url.includes("facebook.com/") || url.includes("instagram.com/") || url.includes("twitter.com/") || url.includes("x.com/");
            const cleanUrl = url.split('?')[0]; // Remove query params
            const isDeepLink = cleanUrl.includes("/posts/") || cleanUrl.includes("/status/") || cleanUrl.includes("/p/") || cleanUrl.includes("/reel/");

            if (isMainProfile && !isDeepLink) return false;

            // 3. Title Keyword check (only if not a main profile)
            if (postTitlePatterns.some(pattern => pattern.test(title)) || postTitlePatterns.some(pattern => pattern.test(desc))) {
                console.log(`[Filter] Removed as post content: ${candidate.name}`);
                return true;
            }

            return false;
        };

        const finalCandidates = Array.from(mergedIdentities.values())
            .filter(c => !isPostCandidate(c))
            .sort((a, b) => {
                if (a.source === "local" && b.source !== "local") return -1;
                if (a.source !== "local" && b.source === "local") return 1;
                return 0;
            });


        const identifyData = {
            candidates: finalCandidates,
            directResolve: directResolve,
            personaName: resolvedPersona ? resolvedPersona.name : null,
            resolvedPersona: resolvedPersona
        };

        // Cache persistent storage
        try {
            await SearchCache.create({ query: normQuery, type: "IDENTIFY", data: identifyData });
        } catch (cErr) {
            if (cErr.code !== 11000) console.error("[Identify] Cache save error:", cErr.message);
        }

        res.json(identifyData);
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
    let name = person.name || "";
    let keyword = person.keywordMatched || "";

    // 1. Strip common separators and extract keyword if missing
    if (name.includes(" - ")) {
        const parts = name.split(" - ");
        name = parts[0].trim();
        if (!keyword) keyword = parts[1].trim();
    } else if (name.includes(" | ")) {
        const parts = name.split(" | ");
        name = parts[0].trim();
        if (!keyword) keyword = parts[1].trim();
    }

    // 2. Remove redundant keyword suffixes from the name (Case Insensitive)
    if (keyword) {
        const kw = keyword.toLowerCase().trim();
        let nl = name.toLowerCase();
        if (nl.endsWith(" " + kw)) {
            name = name.substring(0, name.length - (kw.length + 1)).trim();
        } else if (nl.includes(" - " + kw)) {
            name = name.split(" - ")[0].trim();
        }
    }

    // 3. Final Name Polish: ensure we have at least First and Last name
    // But DON'T aggressively cut to 2 words if it's already a clean name
    name = name.replace(/["'()]/g, "").trim();

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

    console.log(`[Deep Search]Target: ${name} | Keyword: ${keyword} | Location: ${location} `);

    try {
        // 1. Priority 1: Search Local Database & CSVs with Fuzzy Matching
        const localResults = [];
        const localPhones = new Set();
        const localEmails = new Set();

        // Extract a fuzzy search term (e.g., first two names) to catch records like "Ahmed Khatri Student"
        const nameParts = name.split(' ');
        const fuzzyName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[1]} ` : name;

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

        // ID Anchoring: Use known emails/phones to force specific results
        // Merge identifiers from the clicked person AND any discovered local records
        const targetEmails = [...new Set([
            ...(person.emails || (person.email ? [person.email] : [])),
            ...Array.from(localEmails)
        ])];
        const targetPhones = [...new Set([
            ...(person.phoneNumbers || (person.phone ? [person.phone] : [])),
            ...Array.from(localPhones)
        ])];

        // Build anchor string for search queries
        let anchorQuery = "";
        const emailAnchor = targetEmails.length > 0 ? ` "${targetEmails[0]}"` : "";
        const phoneAnchor = targetPhones.length > 0 ? ` "${targetPhones[0]}"` : "";
        anchorQuery = `${emailAnchor}${phoneAnchor} `;

        // Query 1: Targeted Social Sweep (Strict with anchors)
        const hasK = keyword && name.toLowerCase().includes(keyword.toLowerCase());
        const socialSitesFilter = supportedPlatformDomains.map(d => `site:${d}`).join(" OR ");
        const socialQueryStrict = `"${name}" ${hasK ? "" : keyword}${anchorQuery} (${socialSitesFilter})`.trim();

        // Query 1b: Broad Social Sweep (Fallback if anchors fail)
        const socialQueryBroad = `"${name}" ${hasK ? "" : keyword} (${socialSitesFilter})`.trim();

        // Query 2: Broad Context Sweep (Contacts/Emails focus)
        const contextKeywords = keyword || cleanProfession || "profile OR bio OR contact";
        const contextQueryStrict = `"${name}" ${cleanLocation} ${contextKeywords}${anchorQuery} `.trim();
        const contextQueryBroad = `"${name}" ${cleanLocation} ${contextKeywords} `.trim();

        // Query 3: Image Sweep - Enhanced with context to avoid name collisions
        const professionTerms = cleanProfession ? cleanProfession.split(/[\s,]+/).filter(t => t.length > 3) : [];
        const descriptionTerms = person.description ? person.description.split(/[\s,]+/).filter(t => t.length > 3) : [];
        const contextKeywordsList = [...new Set([...professionTerms, ...descriptionTerms])].slice(0, 5); // Pick top 5 markers

        console.log(`[Deep Search] Using context markers for image validation: ${contextKeywordsList.join(', ')} `);

        const imageQuery = `"${name}" ${cleanProfession} "profile picture" OR "portrait"`.trim();
        const fallbackImageQuery = `"${name}" ${cleanProfession} headshot`.trim();

        // EXECUTION: Perform sweeps + Tier 1 Dorking in parallel
        const dorkParams = { name, keywords: keyword, location: cleanLocation };
        const { tier1: tier1Dorks } = generateDorks(dorkParams);
        console.log(`[Deep Search] Generated ${tier1Dorks.length} Tier 1 dork queries`);

        const [
            socialStrict,
            socialBroad,
            contextBroad,
            initialImageResults,
            wikiResult,
            dorkResults,
            docResults
        ] = await Promise.all([
            performSearch(socialQueryStrict, true).catch(() => []),
            performSearch(socialQueryBroad, true).catch(() => []),
            performSearch(contextQueryBroad, true).catch(() => []),
            searchImages(imageQuery, name, contextKeywordsList).catch(() => []),
            searchWikipedia(name).catch(() => null),
            searchWithDorks(tier1Dorks, 10).catch(() => []),
            searchWithDorks(generateDocumentDorks(dorkParams), 10).catch(() => [])
        ]);

        // Process External Documents
        const externalDocuments = (docResults || []).map(doc => ({
            title: doc.title || "Untitled Document",
            snippet: doc.snippet || doc.text || "No description available",
            url: doc.url || doc.link,
            platform: doc.url?.toLowerCase().endsWith('.pdf') ? 'PDF' :
                (doc.url?.toLowerCase().includes('.doc') ? 'DOCX' :
                    (doc.url?.toLowerCase().includes('.ppt') ? 'PPT' : 'Document')),
            timestamp: new Date().toISOString()
        }));

        // Merge and deduplicate results, favoring strict matches
        const socialResults = [...socialStrict];
        socialBroad.forEach(r => {
            if (!socialResults.some(sr => sr.url === r.url)) socialResults.push(r);
        });

        const contextResults = [...socialResults, ...contextBroad];

        let finalImageResults = initialImageResults;
        if (finalImageResults.length === 0) {
            console.log("[Deep Search] Image search returned 0, attempting fallback...");
            finalImageResults = await searchImages(fallbackImageQuery, name, contextKeywordsList);
        }

        const allSearchItems = [...socialResults, ...contextResults, ...dorkResults];
        console.log(`[Deep Search] Total search items (incl. dorks): ${allSearchItems.length}`);

        // 3. Robust Social Discovery using specialized service with anchors
        const queryWords = name.split(' ');
        let socialProfiles = extractSocialAccounts(allSearchItems, name, queryWords, cleanLocation, targetEmails, targetPhones);

        // CRITICAL FIX: Merge social accounts ALREADY present in the candidate/person data
        // This ensures that if the user clicks a card with a link, it shows up in the dashboard
        if (person.socials && Array.isArray(person.socials)) {
            person.socials.forEach(s => {
                if (!s.url) return;
                const normUrl = s.url.split('?')[0].replace(/\/$/, '').toLowerCase();
                if (!socialProfiles.some(sp => sp.url.split('?')[0].replace(/\/$/, '').toLowerCase() === normUrl)) {
                    socialProfiles.push({
                        ...s,
                        confidence: 'high',
                        identityScore: 100,
                        source: 'Local Archive'
                    });
                }
            });
        }

        // Add Wikipedia result to socialProfiles if found and not duplicate
        if (wikiResult) {
            const normUrl = wikiResult.url.split('?')[0].replace(/\/$/, '').toLowerCase();
            if (!socialProfiles.some(sp => sp.url.split('?')[0].replace(/\/$/, '').toLowerCase() === normUrl)) {
                socialProfiles.push(wikiResult);
            }
        }

        console.log(`[Deep Search] Social profiles found (Phase 1): ${socialProfiles.length} `);

        // --- PHASE 2: RECURSIVE HANDLE PIVOT ---
        // Identify a "Core Identity" to extract a handle for cross-platform matching
        const coreProfile = socialProfiles.find(s =>
            (s.platform.toLowerCase() === 'linkedin' || s.platform.toLowerCase() === 'github') &&
            s.identityScore >= 70
        );

        if (coreProfile && coreProfile.username) {
            console.log(`[Deep Search] Core Identity found: ${coreProfile.platform} (${coreProfile.username}). Launching Pivot Sweep...`);
            const pivotDorks = generatePivotDorks(name, coreProfile.username);

            try {
                const pivotResults = await searchWithDorks(pivotDorks, 10);
                if (pivotResults.length > 0) {
                    console.log(`[Deep Search] Pivot sweep found ${pivotResults.length} new potential matches for handle: ${coreProfile.username}`);

                    // Run second pass of discovery with knownHandle anchor
                    const phase2Profiles = extractSocialAccounts(pivotResults, name, queryWords, cleanLocation, targetEmails, targetPhones, {
                        knownHandle: coreProfile.username
                    });

                    // Merge and deduplicate
                    phase2Profiles.forEach(p2 => {
                        const exists = socialProfiles.some(p1 =>
                            p1.platform.toLowerCase() === p2.platform.toLowerCase() ||
                            p1.url.toLowerCase() === p2.url.toLowerCase()
                        );
                        if (!exists) {
                            console.log(`  [Pivot Success] Found ${p2.platform} via handle correlation`);
                            socialProfiles.push(p2);
                        }
                    });
                }
            } catch (pivotErr) {
                console.error(`[Deep Search] Pivot sweep failed: ${pivotErr.message}`);
            }
        }

        socialProfiles.forEach(s => console.log(`  → ${s.platform}: ${s.username} (${s.url})[score: ${s.identityScore}]`));

        // --- PHASE 3: SEMANTIC IDENTITY VERIFICATION (AI Refinement) ---
        // Only run for profiles with score < 90 to save API costs
        const targetContext = `${person.description || ''} ${cleanProfession || ''} ${cleanLocation || ''}`.trim();
        console.log(`[Deep Search] Starting AI Refinement for ${socialProfiles.length} profiles...`);

        const refinementPromises = socialProfiles.map(async (profile) => {
            // Skip 100-score (anchor/local) profiles
            if (profile.identityScore >= 95) return profile;

            try {
                const verification = await verifyIdentityMatch({
                    targetName: name,
                    targetContext: targetContext,
                    candidate: {
                        title: profile.title || profile.name || profile.username,
                        snippet: profile.bio || profile.description,
                        url: profile.url
                    }
                });

                if (!verification.isMatch && verification.score < 30) {
                    console.log(`  [AI Reject] ${profile.platform}: ${verification.reasoning} (${profile.url})`);
                    return null;
                }

                // Boost score if AI confirms match
                if (verification.isMatch && verification.score > 80) {
                    profile.identityScore = Math.min(100, profile.identityScore + 15);
                    profile.aiVerified = true;
                }

                return profile;
            } catch (err) {
                console.error(`  [AI Error] Failed to verify ${profile.platform}: ${err.message}`);
                return profile; // Fallback to keep if error
            }
        });

        const refinedProfiles = (await Promise.all(refinementPromises)).filter(p => p !== null);
        
        // HEURISTIC FALLBACK: If AI rejected everything, restore the original unrefined list
        // but mark them as unverified to prevent "Empty Results" for valid queries.
        if (refinedProfiles.length === 0 && socialProfiles.length > 0) {
            console.warn(`[Deep Search] AI rejected all ${socialProfiles.length} profiles. Implementing heuristic fallback.`);
            socialProfiles = socialProfiles.map(p => ({ ...p, aiUnverified: true }));
        } else {
            socialProfiles = refinedProfiles;
        }
        
        console.log(`[Deep Search] AI Refinement complete. Final profiles: ${socialProfiles.length}`);

        // --- Layer 1: Anchor Selection (Highest Confidence Image) ---
        let identityAnchor = null;
        const potentialAnchors = [];
        const linkedInProfile = socialProfiles.find(s => s.platform.toLowerCase() === 'linkedin');

        // Prefer LinkedIn thumbnail as the anchor, fallback to existing local image
        if (linkedInProfile && linkedInProfile.thumbnail) potentialAnchors.push(linkedInProfile.thumbnail);
        if (person.image || person.imageUrl) potentialAnchors.push(person.image || person.imageUrl);

        // Validate that the anchor actually contains a human face
        for (const anchorUrl of potentialAnchors) {
            const hasFace = await detectHumanFace(anchorUrl);
            if (hasFace) {
                identityAnchor = anchorUrl;
                break;
            } else {
                console.log(`[Deep Search] Rejected anchor (no clear human face): ${anchorUrl}`);
            }
        }

        console.log(`[Deep Search] Initiating for: ${name}`);

        // Cancellation Detection
        let searchIsCancelled = false;
        req.on('close', () => {
            console.log(`[Deep Search] Request closed by client for: ${name}. Marking as cancelled.`);
            searchIsCancelled = true;
        });

        const isCancelled = () => searchIsCancelled;
        console.log(`[Deep Search] Identity Anchor elected: ${identityAnchor ? identityAnchor.substring(0, 50) + '...' : 'NONE'}`);

        // 4. Extract Contacts (with name-aware email filtering)
        const webPhones = new Set();
        const webEmails = new Set();
        allSearchItems.forEach(r => {
            const extracted = extractContacts(r.text, name);
            extracted.phones.forEach(p => webPhones.add(p));
            extracted.emails.forEach(e => webEmails.add(e));
        });

        // 5. Image Ranking & Selection Pipeline
        const twitterProfile = socialProfiles.find(s => s.platform.toLowerCase() === 'twitter');

        // Collect all potential images with metadata for ranking
        const candidateImages = [];

        // 5a. Images from social profile thumbnails (Highest Trust)
        socialProfiles.forEach(s => {
            if (s.thumbnail) {
                candidateImages.push({
                    url: s.thumbnail,
                    score: 100, // Direct match from verified profile
                    source: s.platform,
                    type: 'profile'
                });
            }
        });

        // 5b. Images from specialized image search (High Trust if scored)
        finalImageResults.forEach(img => {
            const normalized = normalizeImageUrl(img.imageUrl, img.thumbnailUrl);
            if (!normalized) return;

            candidateImages.push({
                url: normalized.original,
                thumbnail: normalized.thumbnail,
                score: img.confidence || 50,
                source: 'Image Search',
                type: 'organic',
                isBlocked: normalized.isBlocked
            });
        });

        // 5c. Images from organic search snippets (Lower Trust, now scored strictly)
        allSearchItems.forEach(r => {
            if (r.images && r.images.length > 0) {
                // If the URL matches our candidate's social URL, boost it
                const isSocialMatch = socialProfiles.some(s => r.url.toLowerCase().includes(s.url.toLowerCase()));

                r.images.forEach(imgUrl => {
                    // Use unified scoring for organic images with professional context
                    const organicScore = calculateImageScore({
                        imageUrl: imgUrl,
                        title: r.title,
                        link: r.url
                    }, name, contextKeywordsList);

                    // Consistency: Use normalization even for organic images
                    const norm = normalizeImageUrl(imgUrl);
                    if (!norm) return;

                    candidateImages.push({
                        url: norm.original,
                        thumbnail: norm.thumbnail,
                        score: isSocialMatch ? Math.max(organicScore, 80) : organicScore,
                        source: r.provider || 'Web',
                        type: 'organic',
                        isBlocked: norm.isBlocked
                    });
                });
            }
        });

        // --- Layer 2: Face Similarity & Detection Filtering ---
        const finalGallery = [];
        const seenUrls = new Set();
        const verificationList = candidateImages
            .sort((a, b) => b.score - a.score)
            .filter(img => img.score >= 10 || img.type === 'profile')
            .slice(0, 15); // Verify top 15 matches to ensure quality and speed

        console.log(`[Deep Search] Starting Layer 2: Face Similarity Filtering for ${verificationList.length} images...`);

        // MULTI-ANCHOR DYNAMIC ELECTION
        // If the primary identityAnchor is missing or fails verification, we elect the best candidate
        let activeAnchor = identityAnchor;
        let electedAnchorUrl = null;

        const verifiedImages = await batchWithPacing(verificationList, async (img) => {
            if (isCancelled()) return { ...img, isBlocked: true, similarity: 0 };
            try {
                const currentUrl = img.url || img.imageUrl;

                // STRICT GATE 1: Does it have a human face?
                const hasFace = await detectHumanFace(currentUrl);
                if (!hasFace) {
                    console.log(`[DeepSearch] Blocking image (no human face): ${currentUrl}`);
                    return { ...img, isBlocked: true, similarity: 0 };
                }

                // If we don't have an activeAnchor yet (it was missing or we want to find the best one)
                // We'll use the first image that has a face as a tentative anchor if needed
                if (!activeAnchor && img.type === 'profile' && !electedAnchorUrl) {
                    electedAnchorUrl = currentUrl;
                    console.log(`[DeepSearch] No primary anchor found. Electing profile image as temporary anchor: ${currentUrl}`);
                }

                const comparisonAnchor = activeAnchor || electedAnchorUrl;

                if (comparisonAnchor) {
                    if (currentUrl === comparisonAnchor) return { ...img, similarity: 100, isBlocked: false };

                    // STRICT GATE 2: Face Similarity
                    const similarity = await verifyFaceSimilarity(comparisonAnchor, currentUrl);

                    // relaxed threshold check (55 is fair for varied headshots)
                    if (similarity < 55) {
                        console.log(`[DeepSearch] Blocking non-matching face: ${currentUrl} (Score: ${similarity})`);
                        return { ...img, isBlocked: true, similarity };
                    } else {
                        return { ...img, similarity, isBlocked: false };
                    }
                } else {
                    // Fallback if no anchor exists but it DOES have a human face
                    return { ...img, similarity: 50, isBlocked: false };
                }
            } catch (err) {
                console.error(`[DeepSearch] Image verification failed for ${img.url}:`, err.message);
                return { ...img, isBlocked: true, similarity: 0 };
            }
        }, 3, 300);
        verifiedImages.forEach(img => {
            if (!img) return; // Skip nulls
            const url = img.url || img.imageUrl;

            // Allow BLOCKED images to pass (frontend handles them via thumbnails)
            // They were previously being hidden here because !img.isBlocked was too strict
            if (url && !seenUrls.has(url)) {
                seenUrls.add(url);
                finalGallery.push(img);
            }
        });
        console.log(`[Deep Search] Layer 2 complete. ${finalGallery.length} images passed filter.`);

        // Determine Primary Image
        let primaryImageObj = null;
        if (identityAnchor) {
            const pNorm = normalizeImageUrl(identityAnchor);
            if (pNorm) {
                primaryImageObj = {
                    original: pNorm.original,
                    thumbnail: pNorm.thumbnail,
                    isBlocked: pNorm.isBlocked
                };
            }
        }

        const finalImages = finalGallery.map(img => ({
            original: img.url,
            thumbnail: img.thumbnail || img.url,
            source: img.source,
            score: img.score,
            similarity: img.similarity,
            isBlocked: img.isBlocked
        }));

        // 6. Article Extraction (label social-origin items as evidence)
        const socialUrls = new Set(socialProfiles.map(s => s.url.toLowerCase()));
        const socialPlatformDomains = ['facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'reddit.com'];
        const articles = allSearchItems
            .filter(r => !socialUrls.has(r.url.toLowerCase()))
            .map(r => {
                const urlLower = (r.url || '').toLowerCase();
                const isSocialEvidence = socialPlatformDomains.some(d => urlLower.includes(d));
                return {
                    title: r.title,
                    snippet: r.text,
                    url: r.url,
                    provider: r.provider,
                    type: isSocialEvidence ? 'social-evidence' : 'article'
                };
            })
            .slice(0, 15);

        // 7. Generate AI Summary (Enhanced with richer context)
        let aiSummary = "";
        try {
            console.time("[AI] Summary Generation");
            const summaryParts = [];
            if (person.description) summaryParts.push(`Professional Description: ${person.description}`);
            if (person.company) summaryParts.push(`Company/Organization: ${person.company}`);
            if (person.location) summaryParts.push(`Location: ${person.location}`);
            if (localResults.length > 0) {
                summaryParts.push(`Internal Archive Records:\n${localResults.map(r => `  - ${r.text}`).join("\n").substring(0, 800)}`);
            }
            if (socialProfiles.length > 0) {
                const topSocials = socialProfiles.slice(0, 5);
                summaryParts.push(`Verified Digital Profiles:\n${topSocials.map(s =>
                    `  - ${s.platform}: @${s.username} (${s.url}) [Confidence: ${s.confidence}]${s.bio ? ' | Bio: ' + s.bio.substring(0, 150) : ''}`
                ).join("\n")}`);
            }
            if (articles.length > 0) {
                const topArticles = articles.slice(0, 5);
                summaryParts.push(`Key Web Mentions:\n${topArticles.map(a =>
                    `  - "${a.title}" — ${(a.snippet || '').substring(0, 200)}`
                ).join("\n")}`);
            }
            if (externalDocuments && externalDocuments.length > 0) {
                summaryParts.push(`External Documents: ${externalDocuments.map(d => d.title).join(", ").substring(0, 300)}`);
            }

            const prompt = `Generate a comprehensive professional dossier summary for ${name}.\n\nAVAILABLE INTELLIGENCE:\n${summaryParts.join("\n\n")}\n\nSynthesize all data points into a structured profile. Highlight professional identity, digital presence, and any notable findings.`;
            aiSummary = await generateText(prompt);
            console.timeEnd("[AI] Summary Generation");
        } catch (summaryErr) {
            console.error("[Deep Search] AI Summary generation failed:", summaryErr.message);
        }

        res.json({
            person: {
                ...person,
                name,
                primaryImage: (finalImages[0])?.original || "",
                phoneNumbers: [...new Set([...localPhones, ...webPhones])],
                emails: [...new Set([...localEmails, ...webEmails])],
                aiSummary: aiSummary
            },
            localData: localResults,
            socials: socialProfiles,
            images: finalImages,
            articles: articles,
            externalDocuments: externalDocuments || []
        });
    } catch (err) {
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
