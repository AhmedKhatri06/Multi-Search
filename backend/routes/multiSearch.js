import express from "express";
import dotenv from "dotenv";
import axios from "axios";
import FormInfo from "../models/FormInfo.js";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";
import SearchCache from "../models/SearchCache.js";
import { ollamaCandidateHandler, identifyPeople, generateText, verifyIdentityMatch, geminiCandidateHandler, getResilientText } from "../services/aiService.js";
import { ollamaGenerateText } from "../services/localSummary.js";
import { searchFree } from "../utils/freeSearch.js";
import { extractSocialAccounts, supportedPlatformDomains } from "../services/socialMediaService.js";
import { parseSocialProfile } from "../services/socialProfileParser.js";
import enrichmentService from "../services/enrichmentService.js";
import { detectInputType, normalizePhoneNumber, extractContacts, normalizeName, intelligentSplit, cleanRawQuery } from "../utils/searchHelper.js";

// Helper: Identify synthetic/placeholder data patterns that should NEVER be used for merging or displayed as 'Verified'
function isPlaceholder(value) {
    if (!value) return true;
    const v = value.toLowerCase().trim();
    return v.includes('noemail.com') || 
           v.includes('example.com') || 
           v.includes('test.com') ||
           v.startsWith('+00') || 
           v === 'not found' || 
           v === 'unknown';
}
import { searchCSVs } from "../services/csvSearchService.js";
import { searchImages, calculateImageScore, searchWithDorks } from "../services/internetSearch.js";
import { verifyFaceSimilarity, detectHumanFace, batchWithPacing } from "../services/faceVerification.js";
import { generateDorks, generatePivotDorks, generateDocumentDorks } from "../services/dorkingService.js";
import { matchInstagramProfiles } from "../services/instagramMatcher.js";
import instagramService from "../services/instagramService.js";
import { enrichContact } from "../services/enrichmentService.js";
import { extractContactInfo } from "../services/contactService.js";
import { maskEmail, maskPhone } from "../utils/privacy.js";

dotenv.config();

const router = express.Router();

// Helper to check for client disconnection
const checkAbort = (req, res) => {
    // Only abort if the connection is truly lost/closed by client
    if (req.socket?.destroyed || res.writableEnded) {
        const err = new Error("Request Aborted by Client");
        err.status = 499;
        throw err;
    }
};

/**
 * Route 1: Discovery (Identify)
 * Fetches initial candidates from Tavily Basic + Local DBs.
 * Filtered via Ollama.
 */
router.post("/identify", async (req, res) => {
    const { name, keywords, location } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    console.log(`[Flow] Discovery Phase: ${name}`);

    try {
        checkAbort(req, res);
        // Parallel fetch: Tavily Basic + Local Repos
        const [internetRes, dbResults, csvResults, sqliteResults] = await Promise.all([
            searchFree(name).catch(() => []),
            Document.find({ text: { $regex: name, $options: "i" } }).limit(5).lean().catch(() => []),
            searchCSVs(name, "NAME").catch(() => []),
            Promise.resolve().then(() => sqliteSearch(name)).catch(() => [])
        ]);

        checkAbort(req, res);

        const rawResults = [
            ...internetRes,
            ...dbResults.map(d => ({ title: name, text: d.text || d.content, source: "MongoDB" })),
            ...csvResults.map(c => ({ title: c.name, text: c.description || c.location, source: "CSV Archives" })),
            ...sqliteResults.map(s => ({ title: s.name, text: s.title || s.description, source: "SQLite DB" }))
        ];

        // Process through Gemini for clean cards (Stable Cloud Alternative)
        const candidates = await geminiCandidateHandler({ name, searchResults: rawResults });

        res.json({ success: true, candidates });
    } catch (err) {
        if (err.status === 499) {
            console.warn(`[Flow] Discovery Aborted for: ${name}`);
            return;
        }
        console.error("[Route] Identify fail:", err.message);
        res.status(500).json({ error: "Discovery failed" });
    }
});

/**
 * Route 2: Refinement
 * Takes selected person, pivots with keyword, and returns improved results.
 */
router.post("/refinement-search", async (req, res) => {
    const { name, description } = req.body;
    if (!name || !description) return res.status(400).json({ error: "Name and Description required" });

    console.log(`[Flow] Refinement Phase: ${name}`);

    try {
        // 1. Extract keyword via Resilient AI (Gemini -> Groq)
        const kwPrompt = `Extract ONE short professional keyword (1-2 words) from this description that helps distinguish this person: "${description}"`;
        const pivotKeyword = await getResilientText(kwPrompt, "Return ONLY the keyword. No punctuation.");
        
        const strictKeyword = (pivotKeyword || "").replace(/Keyword:?/i, "").trim().split('\n')[0];
        console.log(`[Flow] Pivot Keyword: ${strictKeyword}`);

        // 2. Refined Search (Name + Keyword)
        const refinedQuery = `"${name}" ${strictKeyword}`;
        const searchRes = await searchFree(refinedQuery).catch(() => []);

        // 3. Re-process cards (Gemini)
        const candidates = await geminiCandidateHandler({ name, searchResults: searchRes });

        res.json({ success: true, candidates, pivot: strictKeyword });
    } catch (err) {
        if (err.status === 499) {
            console.warn(`[Flow] Refinement Aborted for: ${name}`);
            return;
        }
        console.error("[Route] Refine fail:", err.message);
        res.status(500).json({ error: "Refinement failed" });
    }
});

/**
 * Route 3: Deep Enrichment
 * Final aggregation after person selection.
 */
router.post("/enrichment", async (req, res) => {
    const { person } = req.body; 
    if (!person) return res.status(400).json({ error: "Person data required" });

    console.log(`[Flow] Enrichment Phase: ${person.name}`);

    try {
        checkAbort(req, res);
        // 1. Deep Tavily (Advanced) + Socials
        const deepQuery = `"${person.name}" ${person.description} official social profiles documents`;
        const deepRes = await searchFree(deepQuery, "advanced").catch(() => []); 

        checkAbort(req, res);

        // Handle both simple array (scraper) and object (tavily advanced)
        const deepResults = Array.isArray(deepRes) ? deepRes : (deepRes.results || []);
        const deepImages = Array.isArray(deepRes) ? [] : (deepRes.images || []);

        // 2. Lead Gen (Snov/Apollo) Sequential Flow
        const enrichmentResult = await enrichmentService.enrichContact(
            person.name, 
            person.description
        ).catch(() => ({ emails: [], phones: [] }));
        
        checkAbort(req, res);
        // 3. Aggregate Dorks (PDF/CSV)
        const dorkRes = await searchWithDorks([`"${person.name}" filetype:pdf OR filetype:csv`]).catch(() => []);

        checkAbort(req, res);

        // 4. Generate AI Intelligence Summary
        const evidenceSnippet = deepResults.slice(0, 5).map(r => r.title).join(', ');
        const summaryPrompt = `Generate a concise 3-sentence professional dossier summary for ${person.name} (${person.description}). 
        Context: Discovered ${deepResults.length} profiles including ${evidenceSnippet}. 
        Verified: ${enrichmentResult.emails?.length || 0} emails, ${enrichmentResult.phones?.length || 0} numbers.
        Tone: Professional, Intelligence Report.`;

        const aiSummary = await getResilientText(summaryPrompt).catch(() => "Intelligence acquisition successful. Dossier compiled from available digital evidence.");

        res.json({ 
            success: true, 
            profiles: deepResults,
            documents: dorkRes,
            images: deepImages,
            confirmedIdentity: person,
            emails: enrichmentResult.emails || [],
            phoneNumbers: enrichmentResult.phones || [],
            aiSummary: aiSummary
        });
    } catch (err) {
        if (err.status === 499) {
            console.warn(`[Flow] Enrichment Aborted for: ${person.name}`);
            return;
        }
        console.error("[Route] Enrichment fail:", err.message);
        res.status(500).json({ error: "Enrichment failed" });
    }
});
const LOGIC_VERSION = "v3"; // Bump this when changing rank/merge logic to invalidate stale caches

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

/**
 * Validate if an external document/evidence (PDF, Doc) truly belongs to the target.
 */
function validateEvidence(item, targetName, context = {}) {
    const title = (item.title || "").toLowerCase();
    const snippet = (item.snippet || "").toLowerCase();
    const text = (item.text || "").toLowerCase();
    const combined = `${title} ${snippet} ${text}`;
    
    const nameLower = targetName.toLowerCase();
    const nameParts = nameLower.split(/\s+/).filter(p => p.length > 2);
    
    // 1. Full Name Requirement: Must have at least First + Last anywhere in the doc metadata
    const matchesAll = nameParts.every(part => combined.includes(part));
    
    // 2. Strict Collision Protection: If it's a DIFFERENT person with the same first name
    // e.g. "Atharva Narmale" in "Atharva Auti" search
    if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const surname = nameParts[nameParts.length - 1];
        
        // If it matches first name but has a DIFFERENT surname in a prominent position
        const surnameRegex = new RegExp(`\\b${firstName}\\s+([a-zA-Z]+)`, 'gi');
        let m;
        while ((m = surnameRegex.exec(combined)) !== null) {
            const foundSurname = m[1].toLowerCase();
            if (foundSurname !== surname && foundSurname.length > 3) {
                console.log(`  [Evidence Reject] Surname Collision: Found "${firstName} ${foundSurname}" instead of "${targetName}"`);
                return false;
            }
        }
    }

    if (matchesAll) return true;

    // 3. Fallback: Matches some name parts + matching company/location
    const markers = [context.location, context.keywords, context.profession].filter(Boolean);
    const hasContextMatch = markers.some(m => combined.includes(m.toLowerCase()));
    
    return nameParts.some(part => combined.includes(part)) && hasContextMatch;
}

/**
 * Sanitizes search queries to remove special characters that trigger engine errors.
 */
function sanitizeQuery(str = "") {
    if (!str) return "";

    // LAYER 2: Enhanced Split (Discard text after colons or semicolons)
    // Prevents "Name: CEO Profile" from polluting queries
    const cleaned = str.split(/[:;]/)[0].trim();

    return cleaned
        .replace(/[\-,'()]/g, " ") // Replace remaining special chars with space (PRESERVING QUOTES)
        .replace(/\s+/g, " ")      // Normalize spaces
        .trim();
}

function rankResults(results, query, context = null) {
    const q = normalize(query);
    const keywords = context?.keywords ? context.keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2) : [];
    const location = context?.location ? context.location.toLowerCase() : "";

    return results
        .map(item => {
            const text = (item.text || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            const combinedText = `${title} ${text}`;
            let score = 0;

            // 1. Name Similarity
            if (combinedText.includes(q)) score += 15;
            if (title.startsWith(q)) score += 10;
            
            // Partial Name Match (Handling variations like "Sachin T." or "Tendulkar Sachin")
            const qParts = q.split(" ").filter(p => p.length > 2);
            const matchesAnyPart = qParts.some(part => title.includes(part));
            const matchesAllParts = qParts.every(part => title.includes(part));
            
            if (matchesAllParts) score += 20;
            else if (matchesAnyPart) score += 10;

            // 2. CONTEXTUAL BOOST (The identity differentiator)
            if (keywords.length > 0) {
                keywords.forEach(kw => {
                    if (combinedText.includes(kw)) score += 30; // Massive boost for keyword correlation
                });
            }
            if (location && combinedText.includes(location)) {
                score += 15;
            }

            // 3. Entity Priority (Source Reliability)
            score += (4 - item.priority) * 10;
            
            // 4. Primary Source Boost (LinkedIn)
            if (item.provider === "LinkedIn") {
                const handle = (item.link || "").toLowerCase().split("/in/")[1]?.split("/")[0] || "";
                const matchesHandle = q.split(" ").some(part => handle.includes(part));
                const matchesTitle = q.split(" ").every(part => title.includes(part));
                
                // Only grant professional boost if there's high correlation
                // Prevents unrelated candidates (e.g. news reporters) from outranking based on mentions
                if (matchesHandle || matchesTitle) {
                    score += 30; 
                } else {
                    score -= 20; // Penalize coincidental profile matches
                }
            }

            if (item.source === "Internet") {
                score += 5;
            }

            return { ...item, score };
        })
        .sort((a, b) => b.score - a.score);
}

/**
 * Core search logic combined across MongoDB, SQLite, and Internet sources.
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
        const response = await axios.get(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=1&namespace=0&format=json`, {
            headers: { 'User-Agent': 'LookUpIntelligence/1.0 (contact: khatriahmed405@gmail.com)' }
        });
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

/**
 * Helper: Build safe, short queries to avoid search engine rejections.
 * Limits complexity to 3 sites and query length to ~200 chars.
 */
function buildSafeBuckets(baseQuery, domains, maxSites = 3) {
    const buckets = [];
    let currentBucket = [];
    
    // TIGHTENING: Strip all existing double-quotes before wrapping to avoid ""Name"" errors
    const cleanBase = baseQuery.replace(/"/g, "").trim();

    for (const domain of domains) {
        const potentialBucket = [...currentBucket, domain];
        // SYNTAX FIX: No parentheses for single-site query
        const siteFilter = potentialBucket.length > 1
            ? `(${potentialBucket.map(d => `site:${d}`).join(" OR ")})`
            : `site:${potentialBucket[0]}`;
        const fullQuery = `"${cleanBase}" ${siteFilter}`;
        
        // BUFFER: Lowered threshold from 200 to 180 for safer URL encoding
        if (currentBucket.length < maxSites && fullQuery.length < 180) {
            currentBucket.push(domain);
        } else {
            if (currentBucket.length > 0) buckets.push(currentBucket);
            currentBucket = [domain];
        }
    }
    if (currentBucket.length > 0) buckets.push(currentBucket);
    return buckets;
}

/**
 * Helper: Execution wrapper for the search engine with automatic split handling.
 */
async function performEngineSearch(baseQuery, domains, num, isRefinement = false) {
    // MODULE 9: Permanent Zero-Cost Search
    // We have decommissioned Serper.dev and fully pivoted to the Free Engine
    console.log(`[FreeSearch] Using Aggregated Engine for: "${baseQuery}"`);
    return await searchFree(baseQuery);
}


export async function performSearch(query, simpleMode = false, identityContext = null, isRefinement = false, options = {}) {
    const { skipLocal = false } = options;
    let internetQuery = sanitizeQuery(query);
    const targetName = identityContext?.name || "";
    const normQuery = normalize(query);

    // 1. MODULE 8: Performance / Cost Optimization (Caching)
    const cacheKey = `q:${sanitizeQuery(query).toLowerCase()}|simple:${!!simpleMode}`;
    if (!isRefinement) {
        try {
            const cached = await SearchCache.findOne({ query: cacheKey });
            if (cached && cached.results?.length > 0 && (Date.now() - new Date(cached.timestamp).getTime()) < 24 * 60 * 60 * 1000) {
                console.log(`[Cache Hit] Serving ${cached.results.length} internet results for: ${query}`);
                return cached.results;
            }
        } catch (e) {
            console.warn("[Cache] Lookup failed:", e.message);
        }
    }

    // 2. Extract query parts early
    const localSearchQuery = query.split("(")[0].replace(/site:\S+/g, "").trim();
    const queryWords = localSearchQuery.split(" ").filter(w => w.length > 1);

    let mongoResults = [];
    let sqliteResults = [];

    if (!skipLocal) {
        try {
            mongoResults = await Document.find({ text: { $regex: localSearchQuery, $options: "i" } }).lean();
            sqliteResults = sqliteSearch(localSearchQuery);

            if (mongoResults.length === 0 && queryWords.length >= 2) {
                const nameGuess = queryWords.slice(0, 2).join(" ");
                mongoResults = await Document.find({ text: { $regex: nameGuess, $options: "i" } }).lean();
            }
        } catch (dbErr) {
            console.warn("[DB] Local search failed:", dbErr.message);
        }
    }

    // 3. Internet Search Implementation
    let internetResults = [];
    try {
        if (!simpleMode) {
            const goldDomains = ['linkedin.com', 'en.wikipedia.org', 'twitter.com', 'x.com', 'facebook.com', 'github.com'];
            const otherDomains = supportedPlatformDomains.filter(d => !goldDomains.includes(d) && d !== 'instagram.com');

            const goldBuckets = buildSafeBuckets(internetQuery, goldDomains, 3);
            const otherBuckets = buildSafeBuckets(internetQuery, otherDomains, 3);
            const allBuckets = [...goldBuckets, ...otherBuckets];

            const internetRes = await batchWithPacing(allBuckets, async (bucket) => {
                if (options.signal && options.signal()) return [];
                return performEngineSearch(internetQuery, bucket, isRefinement ? 25 : 15, isRefinement);
            }, 3, 400);

            const seenLinks = new Set();
            internetResults = internetRes.flat().filter(item => {
                const link = item.link || "";
                if (link && !seenLinks.has(link)) {
                    seenLinks.add(link);
                    return true;
                }
                return false;
            });
            console.log(`[FreeSearch] Parallel Sweep: ${internetResults.length} unique results.`);
        } else {
            console.log(`[Search] Simple Free Engine for: "${internetQuery}"`);
            internetResults = await searchFree(internetQuery).catch(() => []);
        }

        // Processing & Filtering
        const processedInternet = [];
        internetResults.forEach((item, index) => {
            let provider = "Google";
            const link = (item.link || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            const snippet = (item.snippet || "").toLowerCase();
            const rawTarget = targetName || "";
            const nameLower = rawTarget.toLowerCase().replace(/["']/g, "");
            const titleLower = title.toLowerCase();
            const targetNameStr = targetName.toLowerCase();

            if (link.includes("linkedin.com")) provider = "LinkedIn";
            else if (link.includes("instagram.com")) provider = "Instagram";
            else if (link.includes("twitter.com") || link.includes("x.com")) provider = "Twitter/X";
            else if (link.includes("facebook.com")) provider = "Facebook";
            else if (link.includes("wikipedia.org")) provider = "Wikipedia";

            const nameParts = nameLower.split(" ").filter(p => p.length > 2); // Only match parts with > 2 chars
            if (nameParts.length === 0) return;

            // LOOSENED FILTER: Allow if at least ONE part matches, or if it's a known high-trust source
            const matchedParts = nameParts.filter(part => title.includes(part) || snippet.includes(part));
            
            const isHighTrust = link.includes('linkedin.com') || link.includes('wikipedia.org') || link.includes('twitter.com') || link.includes('x.com');
            const matchesEnough = matchedParts.length >= 1; // Loosened from requiring all parts

            if (!matchesEnough && !isHighTrust) {
                const isKnowledge = link.includes('wikipedia.org') || link.includes('imdb.com/name');
                if (!isKnowledge && !(isRefinement && provider !== "Google")) return;
            }

            // Filtering
            if (title.includes("profiles |") || title.includes("find people") || link.includes("/search/")) return;

            processedInternet.push({
                id: `internet-${index}`,
                title: item.title || "Untitled",
                text: item.snippet || "No description",
                url: item.link || "",
                source: "Internet",
                provider: provider,
                type: link.includes("wikipedia.org") ? "KNOWLEDGE" : "SOCIAL",
                priority: link.includes("wikipedia.org") ? 0 : 3,
                images: item.imageUrl ? [item.imageUrl] : []
            });
        });

        internetResults = processedInternet;
        
        // Cache Update
        if (internetResults.length > 0 && !isRefinement) {
            SearchCache.findOneAndUpdate({ query: cacheKey }, { results: internetResults, timestamp: new Date() }, { upsert: true }).catch(() => {});
        }
    } catch (err) {
        console.error("Internet Search Phase fail:", err.message);
    }

    // 4. Grouping and Final Ranking
    if (skipLocal) {
        return rankResults(internetResults, query, identityContext);
    }

    const localMap = new Map();
    [
        ...mongoResults.map(doc => ({ id: doc._id, text: doc.text, source: "MongoDB", type: "RECORD", priority: 2, images: [] })),
        ...sqliteResults.map(doc => ({ id: doc.id, text: doc.text, source: "SQLite", type: "PROFILE", priority: 1, images: [doc.image].filter(Boolean) }))
    ].forEach(item => {
        const key = normalize(item.text);
        if (!localMap.has(key)) localMap.set(key, item);
    });

    const combined = [...Array.from(localMap.values()), ...internetResults];
    return rankResults(combined, query, identityContext);
}

/**
 * Stage 1 & 2: Identification
 * Searches Local DB + Internet to find potential personas.
 * Prioritizes Local Data.
 */
router.post("/identify", async (req, res) => {
    let isAborted = false;
    req.on("close", () => {
        isAborted = true;
    });

    const { name, location, keywords, number, isRefinement } = req.body;

    // --- SECURITY SHIELD: Length & Injection Guard ---
    const injectionPattern = /<script|eval\(|javascript:|data:|vbscript:|onSubmit|onMouse|onError|onload/i;
    const combinedInput = `${name || ""} ${keywords || ""} ${location || ""}`;
    
    if (injectionPattern.test(combinedInput)) {
        console.warn(`[Security] Blocked potential injection attempt: ${combinedInput}`);
        return res.status(403).json({ error: "Unsafe input detected" });
    }

    // Hard Truncation (Safety for external APIs)
    const safeName = (name || "").substring(0, 30).trim();
    const safeKeywords = (keywords || "").substring(0, 30).trim();
    const safeLocation = (location || "").substring(0, 30).trim();

    if (!safeName) {
        return res.status(400).json({ error: "Search query is required" });
    }

    // --- MODULE 1: Clean → Split → Normalize ---
    // 1. Clean raw input (noise removal)
    const cleanedName = cleanRawQuery(safeName);
    const cleanedKeywords = cleanRawQuery(safeKeywords);
    const safeNumber = normalizePhoneNumber(number || "");

    // 2. Intelligent Split & Final Normalization
    let finalName = normalizeName(cleanedName);
    let finalKeywords = cleanedKeywords ? normalizeName(cleanedKeywords) : "";

    if (!finalKeywords && !safeNumber) {
        const split = intelligentSplit(cleanedName);
        if (split.keywords) {
            finalName = normalizeName(split.name);
            finalKeywords = normalizeName(split.keywords);
            console.log(`[Identify] Auto-split & Cleaned -> Name: "${finalName}" | Keywords: "${finalKeywords}"`);
        }
    }

    // EVIDENCE-CACHE: Prevents collisions and supports logic versioning
    const normQuery = `n:${finalName}|k:${finalKeywords || ""}|l:${normalize(safeLocation || "")}|p:${safeNumber}|v:${LOGIC_VERSION}`;

    try {

        // EVIDENCE-CACHE: Prevents collisions and supports logic versioning.
        // We now use the exact Search Context (Name + Keywords + Location) for the raw-search cache key.
        // This ensures a refined search (with keywords) bypasses a stale "name-only" empty result.
        const inputType = detectInputType(finalName);
        // console.log(`[Identify] Detected Type: ${inputType} | Query: ${finalName} | Keyword: ${finalKeywords} | Number: ${safeNumber} `);

        const searchQuery = safeNumber || finalName;
        const searchType = safeNumber ? "PHONE" : inputType;

        // Identity Context for search enrichment and filtering
        const identityContext = { name: finalName, location: safeLocation, keywords: finalKeywords, number: safeNumber };

        // Prepare internet query early constraint
        let internetQuery = "";
        if (inputType === "NAME") {
            // PIVOT: If keywords or location are provided, we lead with a BROAD search to find the niche profile
            if (finalKeywords || safeLocation) {
                internetQuery = `"${finalName}" ${safeLocation || ""} ${finalKeywords || ""}`;
            } else {
                internetQuery = finalName; // Let performSearch buckets handle social site restrictions!
            }
        } else {
            console.log(`[Identify] Phone Search Detected. Routing to Local Sources only.`);
            internetQuery = ""; // No internet query for phone numbers
        }

        console.log(`[Identify] Target: ${finalName}${finalKeywords ? ` | Key: ${finalKeywords}` : ""}`);
        // console.log(`[Identify] Internet Query: ${internetQuery}`);

        // 1. Parallel execution for local storage and internet
        const [csvResults, sqliteResults, dbResults, internetRes] = await Promise.all([
            searchCSVs(searchQuery, searchType).catch(e => { console.error("[CSV] err:", e.message); return []; }),
            Promise.resolve().then(() => sqliteSearch(searchQuery)).catch(e => { console.error("[SQLite] err:", e.message); return []; }),
            Document.find({ text: { $regex: searchQuery, $options: "i" } }).limit(10).lean().catch(e => { console.warn("[MongoDB] Identify failed:", e.message); return []; }),
            (async () => {
                // BLOCK: External API Firewall for Phone Numbers
                if (searchType === "PHONE") {
                    return []; // Securely exit internet discovery for phone inputs
                }

                // WAVE 1: Standard Internet Discovery (Social Buckets - Name Only)
                // DIAGNOSTIC FIX: Temporarily forcing simpleMode=true to bypass bucket 400 errors
                const socialRes = await performSearch(internetQuery, true, identityContext, isRefinement, { skipLocal: true, signal: () => isAborted })
                    .catch(e => { console.error("[Identify] Social Wave fail:", e.message); return []; });
                if (isAborted) return [];

                let sRes = [];
                const seenUrls = new Set();
                const addResults = (results) => {
                    (results || []).forEach(item => {
                        const url = (item.url || "").toLowerCase().trim();
                        if (url && !seenUrls.has(url)) {
                            seenUrls.add(url);
                            sRes.push(item);
                        }
                    });
                };

                addResults(socialRes);

                // FALLBACK: If few results, trigger Wide-Net and Keyword discovery
                if (sRes.length < 3 && (keywords || location)) {
                    console.log(`[Identify] Insufficient name results (${sRes.length}). Triggering keyword fallback...`);
                    const wideQuery = `${name} ${location || ""} ${keywords || ""}`.trim();
                    const wideRes = await performSearch(wideQuery, true, identityContext, isRefinement, { skipLocal: true, signal: () => isAborted })
                        .catch(e => []);
                    addResults(wideRes);

                    if (sRes.length < 5 && keywords && inputType === "NAME") {
                        const keywordQuery = `"${name}" ${keywords}`.trim();
                        const kwRes = await performSearch(keywordQuery, true, identityContext, true, { skipLocal: true, signal: () => isAborted })
                            .catch(e => []);
                        addResults(kwRes);
                    }
                }

                // console.log(`[Identify] Parallel Discovery complete. Total Unique Sources: ${sRes.length}`);

                // Broaden search ONLY if still extremely few results for a name
                if (sRes.length < 3 && inputType === "NAME") {
                    console.log(`[Identify] Insufficient results (${sRes.length}). Triggering targeted broad sweep.`);
                    const broadQuery = `${name} ${location || ""} ${keywords || ""} profile biography official site`.trim();
                    const broadRes = await performSearch(broadQuery, true, identityContext, isRefinement, { skipLocal: true, signal: () => isAborted }).catch(e => []);
                    addResults(broadRes);
                }

                return (sRes || []).map(r => ({
                    ...r,
                    // Sanitization: Ensure placeholders are NEVER returned from discovery
                    email: isPlaceholder(r.email) ? null : r.email,
                    phoneNumbers: (r.phoneNumbers || []).filter(p => !isPlaceholder(p))
                }));
            })()
        ]);

        // 2. Identity Enrichment Pipeline (Wrapped in safety guard to prevent process exit)
        const signals = extractContactInfo(internetRes || []);
        const enrichedEmails = signals.emails || [];
        const enrichedPhones = [...new Set([...(signals.phones || []), number].filter(Boolean))];

        if (enrichedEmails.length > 0 || enrichedPhones.length > 1) {
            console.log(`[Identify] Discovered Identity Signals -> Emails: ${enrichedEmails.length} | Phones: ${enrichedPhones.length}`);
        }

        console.log(`[Identify] Results -> CSV: ${csvResults?.length || 0} | SQLite: ${sqliteResults?.length || 0} | Mongo: ${dbResults?.length || 0} | Internet: ${internetRes?.length || 0}`);

        let mongoResults = dbResults || [];
        let searchResults = internetRes || [];
        let internetCandidates = [];

        // Map local data to a common candidate structure with keyword-aware filtering
        // If keywords are provided, prioritize local records that match them
        const filteredCSVs = keywords ? csvResults.filter(r => {
            const text = JSON.stringify(r).toLowerCase();
            return keywords.toLowerCase().split(/\s+/).some(kw => text.includes(kw));
        }) : csvResults;

        const filteredSQLite = keywords ? sqliteResults.filter(p => {
            const text = (p.text || p.description || p.name || "").toLowerCase();
            return keywords.toLowerCase().split(/\s+/).some(kw => text.includes(kw));
        }) : sqliteResults;

        const localCandidates = [
            ...filteredCSVs.map(r => ({
                name: r.name,
                description: r.description?.split(' ').slice(0, 5).join(' ') || "Record found in CSV Archive",
                location: r.location || "Archives",
                company: r.company || r.CompanyName || keywords || "",
                confidence: "Verified",
                source: "local",
                url: "",
                image: r.image,
                phoneNumbers: (r.phoneNumbers || []).filter(p => !isPlaceholder(p)),
                email: isPlaceholder(r.email) ? null : r.email,
                keywordMatched: keywords || ""
            })),
            ...filteredSQLite.map(p => {
                const parts = (p.text || "").split(" - ");
                const baseName = p.name || parts[0]?.trim() || "Unknown";
                const tagline = p.title || p.description || parts.slice(1).join(" - ").trim() || "Identity SQL Record";
                return {
                    name: baseName,
                    description: tagline.split(' ').slice(0, 5).join(' '),
                    location: p.location || "Identity SQL",
                    company: p.company || keywords || "",
                    confidence: "Verified",
                    source: "local",
                    url: p.url || "",
                    image: p.image,
                    phoneNumbers: p.phone && !isPlaceholder(p.phone) ? [p.phone] : [],
                    email: isPlaceholder(p.email) ? "" : (p.email || ""),
                    keywordMatched: keywords || ""
                };
            }),
            ...mongoResults.map(d => ({
                name: (inputType === "PHONE" ? "Potential Lead" : name),
                description: "Record found in Cluster DB",
                location: "Cluster DB Archives",
                company: d.company || keywords || "",
                confidence: "Verified",
                source: "local",
                url: "",
                email: isPlaceholder(d.email) ? null : d.email,
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
                    return {
                        ...c,
                        source: "internet",
                        // REMOVE: Programmatic name decoration (fixes the "SBMP" in name bug)
                        keywordMatched: keywords || ""
                    };
                });

                // If AI finds nothing but we have results, provide raw results as fallback
                if ((!internetCandidates || internetCandidates.length === 0)) {
                    internetCandidates = searchResults.map(r => ({
                        name: r.title.split(/[-|]/)[0].trim(),
                        description: r.text || "Web result",
                        location: r.provider || "Internet",
                        company: keywords || "",
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
                    return {
                        name: title,
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
        // Prioritize: Local > KnowledgeBase > IG-Technical > InternetAI
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
                if (!nameMatch) continue;

                // --- CONTRADICTION CHECKS (CRITICAL) ---
                const normLoc = (candidate.location || "").toLowerCase().trim();
                const existingLoc = (existing.location || "").toLowerCase().trim();

                // If locations exist and are different (at a city/country level), do NOT merge
                const hasLocationContradiction = (normLoc && existingLoc) &&
                    !normLoc.includes(existingLoc) && !existingLoc.includes(normLoc);

                // --- POSITIVE OVERLAP CHECKS ---
                const companyMatch = (normCompany && existingNormCompany) &&
                    (existingNormCompany.includes(normCompany) || normCompany.includes(existingNormCompany)) &&
                    (normCompany.length >= 3 || existingNormCompany.length >= 3);

                // --- CONFLICT CHECKS: Professional Domain ---
                const hasCompanyContradiction = (normCompany && existingNormCompany) && !companyMatch;

                // NEW: Career Stage Merging (Student / Intern / Junior)
                const roleKeywords = ["student", "intern", "trainee", "junior", "associate", "candidate", "fellow"];
                const isEarlyCareer = roleKeywords.some(kw => (candidate.description || "").toLowerCase().includes(kw));
                const existingIsEarlyCareer = roleKeywords.some(kw => (existing.description || "").toLowerCase().includes(kw));
                
                const careerStageMatch = (isEarlyCareer || existingIsEarlyCareer) && !hasLocationContradiction;

                const candidateEmails = (candidate.email ? [candidate.email] : (candidate.emails || [])).filter(e => !isPlaceholder(e));
                const candidatePhones = (candidate.phoneNumbers || (candidate.phone ? [candidate.phone] : [])).filter(p => !isPlaceholder(p));
                const existingEmails = (existing.emails || []).filter(e => !isPlaceholder(e));
                const existingPhones = (existing.phoneNumbers || []).filter(p => !isPlaceholder(p));

                const sharedEmail = candidateEmails.some(e => existingEmails.includes(e));
                const sharedPhone = candidatePhones.some(p => existingPhones.includes(p));

                // --- KNOWLEDGE SOURCE SPECIAL CASE ---
                const isKnowledgeSource = candidate.type === 'knowledge' || existing.type === 'knowledge' ||
                    (candidate.company || '').toLowerCase() === 'knowledge base' ||
                    (existing.company || '').toLowerCase() === 'knowledge base';

                const sharedUrl = candidate.url && (existing.url === candidate.url || existing.socials?.some(s => s.url === candidate.url));
                const verifiedMatch = sharedUrl || sharedEmail || sharedPhone;
                const bothLocal = candidate.source === "local" && existing.source === "local";
                
                if ((verifiedMatch && !hasCompanyContradiction) || (bothLocal && companyMatch) || (careerStageMatch && companyMatch)) {
                    existingKey = key;
                    break;
                }
            }

            if (!existingKey) {
                // To avoid accidental collapse (Map Overwrite), we use the Map size to create a unique identity ID 
                // if they haven't been merged by the "positive overlap" rules.
                const identityId = `${compositeKey}|${mergedIdentities.size}`;
                
                mergedIdentities.set(identityId, {
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
                existing.phoneNumbers = [...new Set([...(existing.phoneNumbers || []), ...(candidate.phoneNumbers || []), ...(candidate.phone ? [candidate.phone] : [])])].filter(p => !isPlaceholder(p));
                existing.emails = [...new Set([...(existing.emails || []), ...(candidate.emails || []), ...(candidate.email ? [candidate.email] : [])])].filter(e => !isPlaceholder(e));

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
                // console.log(`[Filter] Removed as post content: ${candidate.name}`);
                return true;
            }

            return false;
        };

        const finalCandidates = Array.from(mergedIdentities.values())
            .filter(c => !isPostCandidate(c))
            .map(candidate => {
                let rankScore = 0;
                const kw = (keywords || "").toLowerCase();
                const loc = (location || "").toLowerCase();
                const text = `${candidate.name} ${candidate.description} ${candidate.company}`.toLowerCase();

                // 1. Explicit Local Match (Still valuable for historical accuracy)
                if (candidate.source === "local") rankScore += 40;

                // 2. CONTEXTUAL OVERLAP (Identity precision)
                if (kw && text.includes(kw)) rankScore += 50;
                if (loc && (text.includes(loc) || (candidate.location || "").toLowerCase().includes(loc))) rankScore += 30;

                // 3. CONFIDENCE BOOST (AI/Verified signal)
                if (candidate.confidence === "Verified") rankScore += 20;
                if (candidate.confidence === "High") rankScore += 10;

                return { ...candidate, rankScore };
            })
            .sort((a, b) => (b.rankScore || 0) - (a.rankScore || 0));


        const identifyData = {
            candidates: finalCandidates,
            directResolve: directResolve,
            personaName: resolvedPersona ? resolvedPersona.name : null,
            resolvedPersona: resolvedPersona
        };

        // We NO LONGER save the final identifyData to the SearchCache here. 
        // This ensures the "Identity Resolution Logic" always runs fresh on the evidence.
        // The API credits are already saved by caching raw internet results in performSearch().

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
    let isAborted = false;
    req.on("close", () => {
        isAborted = true;
        console.log("[Deep Search] Request closed by client. Aborting.");
    });

    const { person } = req.body;
    if (!person || !person.name) return res.status(400).json({ error: "Person data required" });

    // --- SECURITY SHIELD: Length & Injection Guard ---
    const injectionPattern = /<script|eval\(|javascript:|data:|vbscript:|onSubmit|onMouse|onError|onload/i;
    const combinedInput = `${person.name || ""} ${person.keywords || ""} ${person.location || ""}`;
    
    if (injectionPattern.test(combinedInput)) {
        return res.status(403).json({ error: "Unsafe input detected" });
    }

    // Force truncation for external APIS
    person.name = person.name.substring(0, 30);
    if (person.keywords) person.keywords = person.keywords.substring(0, 30);
    if (person.location) person.location = person.location.substring(0, 30);

    // --- MODULE 1: Clean → Normalise ---
    let name = cleanRawQuery(person.name || "");
    let keyword = cleanRawQuery(person.keywordMatched || "");
    
    // Final normalization (strip remaining noise)
    name = normalizeName(name);
    keyword = normalizeName(keyword);

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
    // TIGHTENING: Strip all internal quotes to prevent ""name"" pollution
    name = name.replace(/["'()]/g, "").trim();
    keyword = (keyword || "").replace(/["'()]/g, "").trim();

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
    const identityContext = { name, keywords: keyword, location };

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

            // Deduplicate local results by text and add source labels
            const uniqueLocal = new Map();
            sqliteMatch.forEach(p => {
                const txt = (p.text || p.description || "").toLowerCase().trim();
                if (!uniqueLocal.has(txt)) {
                    uniqueLocal.set(txt, {
                        text: p.text || p.description || p.name,
                        source: "SQLite source",
                        priority: 1
                    });
                }
                if (p.phone) localPhones.add(normalizePhoneNumber(p.phone));
                if (p.email) localEmails.add(p.email.toLowerCase().trim());
            });

            mongoMatch.forEach(r => {
                const txt = (r.text || r.description || "").toLowerCase().trim();
                if (!uniqueLocal.has(txt)) {
                    uniqueLocal.set(txt, {
                        text: r.text || r.description || r.name,
                        source: "MongoDB source",
                        priority: 1
                    });
                }
                if (r.email) localEmails.add(r.email.toLowerCase().trim());
            });

            csvMatch.forEach(r => {
                const txt = (r.text || r.description || "").toLowerCase().trim();
                if (!uniqueLocal.has(txt)) {
                    uniqueLocal.set(txt, {
                        text: r.text || r.description || r.name,
                        source: "CSV source",
                        priority: 1
                    });
                }
                if (r.phoneNumbers) r.phoneNumbers.forEach(p => localPhones.add(p));
                if (r.email) localEmails.add(r.email.toLowerCase().trim());
                if (r.emails) r.emails.forEach(e => localEmails.add(e.toLowerCase().trim()));
            });

            localResults.push(...uniqueLocal.values());
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

        // EXECUTION: Perform sweeps + Tier 1 Dorking + Contact Enrichment in parallel
        const dorkParams = { name, keywords: keyword, location: cleanLocation };
        const { tier1: tier1Dorks } = generateDorks(dorkParams);

        // GLOBAL IDENTITY SWEEP: Unbiased broad search to discover ALL platforms for this name
        // This ensures consistent results regardless of which selection card was clicked
        const globalIdentityQuery = `"${name}" (${socialSitesFilter} OR site:en.wikipedia.org OR site:britannica.com)`.trim();

        // Calculate potential domain for enrichment
        let targetDomain = null;
        if (keyword && keyword.includes('.') && !keyword.includes(' ')) targetDomain = keyword;

        let [
            socialStrict,
            socialBroad,
            contextBroad,
            initialImageResults,
            wikiResult,
            dorkResults,
            docResults,
            globalSweepResults,
            enrichmentResult
        ] = await Promise.all([
            performSearch(socialQueryStrict, true, identityContext, false, { signal: () => isAborted }).catch(() => []),
            performSearch(socialQueryBroad, true, identityContext, false, { signal: () => isAborted }).catch(() => []),
            performSearch(contextQueryBroad, true, identityContext, false, { signal: () => isAborted }).catch(() => []),
            searchImages(imageQuery, name, contextKeywordsList).catch(() => []),
            searchWikipedia(name).catch(() => null),
            searchWithDorks(tier1Dorks, 10).catch(() => []),
            searchWithDorks(generateDocumentDorks(dorkParams), 10).catch(() => []),
            performSearch(globalIdentityQuery, true, identityContext, false, { signal: () => isAborted }).catch(() => []),
            enrichContact(name, keyword || profession, targetDomain).catch(e => {
                console.error("[Enrich] Deep failure:", e.message);
                return null;
            })
        ]);

        console.log(`[Deep Search] Generated ${tier1Dorks.length} Tier 1 dork queries`);


        // Process External Documents with strict validation
        const externalDocuments = (docResults || [])
            .filter(doc => validateEvidence(doc, name, { location: cleanLocation, keywords: keyword, profession: cleanProfession }))
            .map(doc => ({
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

        // GLOBAL IDENTITY MERGE: Inject unbiased global sweep results
        // This ensures profiles discovered without card-specific bias are always included
        (globalSweepResults || []).forEach(r => {
            if (!socialResults.some(sr => sr.url === r.url)) socialResults.push(r);
        });

        const contextResults = [...socialResults, ...contextBroad];

        let finalImageResults = initialImageResults;
        if (finalImageResults.length === 0) {
            console.log("[Deep Search] Image search returned 0, attempting fallback...");
            finalImageResults = await searchImages(fallbackImageQuery, name, contextKeywordsList);
        }

        const allSearchItems = [...socialResults, ...contextResults, ...dorkResults];
        
        // --- BASELINE DISCOVERY (Phase 2 Resilience) ---
        // If Layer 1 anchors and dorks yielded nothing, trigger a fallback "Identity Hunt"
        if (allSearchItems.length === 0) {
            console.warn(`[Deep Search] No signals detected for ${name}. Triggering Baseline Discovery...`);
            const fallbackQuery = `"${name}" ${cleanProfession} site:linkedin.com/in/ OR site:twitter.com OR site:github.com`.trim();
            const discoveryResults = await performSearch(fallbackQuery, true, identityContext, true).catch(() => []);
            if (discoveryResults.length > 0) {
                console.log(`[Deep Search] Baseline Discovery found ${discoveryResults.length} new signals.`);
                allSearchItems.push(...discoveryResults);
            }
        }

        console.log(`[Deep Search] Total search items (incl. dorks): ${allSearchItems.length}`);

        // 3. Robust Social Discovery using specialized service with anchors
        const queryWords = name.split(' ');
        let socialProfiles = extractSocialAccounts(allSearchItems, name, queryWords, cleanLocation, targetEmails, targetPhones);

        // --- Integrated Instagram Matcher (OSINT enhancement) ---
        const instagramCandidates = matchInstagramProfiles(allSearchItems, {
            name,
            company: person.company,
            location: cleanLocation,
            email: targetEmails[0] || ''
        });

        // --- NEW: Stage 1 Performance-Grade Discovery (Independent Proofing) ---
        console.log(`[Deep Search] Launching Technical Instagram Proofing for: ${name}...`);
        const technicalIgResults = await instagramService.identify(name, targetEmails, targetPhones).catch(() => []);

        technicalIgResults.forEach(ig => {
            const igUrl = ig.url.toLowerCase().replace(/\/$/, '');
            const existingIndex = instagramCandidates.findIndex(c => c.url.toLowerCase().replace(/\/$/, '') === igUrl);

            if (existingIndex === -1 && ig.confidence >= 40) {
                console.log(`  [IG Service] Found new technical candidate: ${ig.handle} (Confidence: ${ig.confidence})`);
                instagramCandidates.push({
                    username: ig.handle,
                    fullName: name,
                    bio: ig.reason,
                    url: ig.url,
                    score: ig.confidence,
                    confidence: ig.confidence >= 90 ? 'High' : 'Medium',
                    platform: 'Instagram'
                });
            } else if (existingIndex !== -1 && ig.confidence > instagramCandidates[existingIndex].score) {
                console.log(`  [IG Service] Upgrading confidence for ${ig.handle} via technical proofing.`);
                instagramCandidates[existingIndex].score = ig.confidence;
                instagramCandidates[existingIndex].confidence = ig.confidence >= 90 ? 'High' : 'Medium';
                instagramCandidates[existingIndex].bio = `${instagramCandidates[existingIndex].bio} | ${ig.reason}`;
            }
        });

        // Merge Instagram candidates if they are higher confidence or missing
        instagramCandidates.forEach(ig => {
            const igUrl = ig.url.toLowerCase().replace(/\/$/, '');
            const existingIndex = socialProfiles.findIndex(sp => sp.url.toLowerCase().replace(/\/$/, '') === igUrl);

            if (existingIndex === -1 && ig.score >= 30) {
                console.log(`  [Instagram Matcher] Found new candidate: ${ig.username} (Score: ${ig.score})`);
                socialProfiles.push(ig);
            } else if (existingIndex !== -1) {
                // If existing, update confidence if the matcher score is better
                if (ig.score > socialProfiles[existingIndex].identityScore) {
                    console.log(`  [Instagram Matcher] Upgrading score for ${ig.username}: ${socialProfiles[existingIndex].identityScore} -> ${ig.score}`);
                    socialProfiles[existingIndex].identityScore = ig.score;
                    socialProfiles[existingIndex].confidence = ig.confidence.toLowerCase();
                }
            }
        });

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
        // EXPANDED: Accept any platform with a username and high identity score
        const coreProfile = socialProfiles.find(s =>
            s.username && s.identityScore >= 70 &&
            ['linkedin', 'github', 'twitter', 'x', 'instagram', 'facebook'].includes(s.platform.toLowerCase())
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

                    // --- Integrated Instagram Matcher (Pivot enhancement) ---
                    const pivotIgCandidates = matchInstagramProfiles(pivotResults, {
                        name,
                        company: person.company,
                        location: cleanLocation,
                        email: targetEmails[0] || ''
                    });

                    pivotIgCandidates.forEach(ig => {
                        const existsInPhase2 = phase2Profiles.some(p2 => p2.url.toLowerCase().replace(/\/$/, '') === ig.url.toLowerCase().replace(/\/$/, ''));
                        if (!existsInPhase2 && ig.score >= 30) {
                            phase2Profiles.push(ig);
                        }
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
            // SECOND PASS ENRICHMENT: Attempt again with corporate context only if needed
            const hasVerifiedEmail = enrichmentResult?.emails?.some(e => e.includes('@') && !e.includes('example.com'));
            const hasMultiplePhones = enrichmentResult?.phones?.length > 1;

            if (!hasVerifiedEmail && !hasMultiplePhones && socialProfiles.length > 0) {
                console.log(`[Deep Search] Early enrichment insufficient. Starting second pass with social anchoring...`);
                // CONSOLDIDATION: Use the broad enrichContact which now returns objects
                const secondPass = await enrichContact(name, null, targetDomain, socialProfiles);
                if (secondPass) {
                    console.log(`[Deep Search] Second pass success: Found ${secondPass.emails?.length || 0} emails and ${secondPass.phones?.length || 0} phones.`);
                    enrichmentResult = secondPass;
                }
            } else {
                console.log(`[Deep Search] Smart Skip: Sufficient intelligence gathered in first pass.`);
            }

            // Wikipedia Image Integration
            if (wikiResult && wikiResult.imageUrl) {
                finalImageResults.unshift({
                    id: `wiki-image-0`,
                    title: `${name} (Wikipedia)`,
                    imageUrl: wikiResult.imageUrl,
                    thumbnailUrl: wikiResult.imageUrl,
                    sourceUrl: wikiResult.url,
                    source: 'Wikipedia',
                    confidence: 95
                });
            }
        }

        console.log(`[Deep Search] AI Refinement complete. Final profiles: ${socialProfiles.length}`);

        // AI Bio-Miner: Wikipedia Fallback
        let finalDescription = profession || person.description || "Intelligence Synthesis Target";
        if (!wikiResult && socialProfiles.length > 0) {
            console.log(`[Bio-Miner] Wikipedia empty. Synthesizing bio from ${socialProfiles.length} profiles...`);
            const bioSourceRaw = socialProfiles
                .filter(s => s.identityScore >= 70)
                .slice(0, 3)
                .map(s => `${s.platform}: ${s.username} - ${s.title || ''} ${s.snippet || s.bio || ''}`)
                .join("\n");

            if (bioSourceRaw.length > 20) {
                const bioPrompt = `Synthesize a short, professional one-sentence biography (max 30 words) for ${name} based on these social signals:\n${bioSourceRaw}\n\nReturn ONLY the bio string. No introductory text.`;

                // PERMANENT STABILITY FIX: Synthesis Timeout (Circuit Breaker)
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("Synthesis Timeout")), 12000)
                );

                const synthesizedBio = await Promise.race([
                    generateText(bioPrompt),
                    timeoutPromise
                ]).catch((e) => {
                    console.warn(`[Bio-Miner] Synthesis failed or timed out: ${e.message}`);
                    return null;
                });

                if (synthesizedBio) {
                    finalDescription = synthesizedBio.trim().replace(/^"|"$/g, '');
                    console.log(`[Bio-Miner] Synthesis successful: ${finalDescription.slice(0, 40)}...`);
                }
            }
        }

        // Cancellation Detection (moved early)
        let searchIsCancelled = false;
        req.on('close', () => {
            console.log(`[Deep Search] Request closed by client for: ${name}. Marking as cancelled.`);
            searchIsCancelled = true;
        });
        const isCancelled = () => searchIsCancelled;

        // PERMANENT STABILITY FIX: AI Summary moved to /verify layer

        // 4. Extract Contacts from Search Snippets (Layer 1 Fast Task)
        const webPhones = new Set();
        const webEmails = new Set();
        allSearchItems.forEach(r => {
            const extracted = extractContacts(r.text, name);
            extracted.phones.forEach(p => webPhones.add(p));
            extracted.emails.forEach(e => webEmails.add(e));
        });

        const finalEmails = [...new Set([
            ...(person.emails || []), 
            ...(enrichmentResult?.emails || []), 
            ...(enrichmentResult?.email ? [enrichmentResult.email] : []),
            ...Array.from(localEmails), 
            ...Array.from(webEmails)
        ])].filter(e => !isPlaceholder(e));

        const finalPhones = [...new Set([
            ...(person.phoneNumbers || []), 
            ...(enrichmentResult?.phones || []), 
            ...(enrichmentResult?.phone ? [enrichmentResult.phone] : []),
            ...Array.from(localPhones), 
            ...Array.from(webPhones)
        ])].filter(p => !isPlaceholder(p));

        // MODULE 6: Apply PII Masking
        const maskedEmails = finalEmails.map(maskEmail);
        const maskedPhones = finalPhones.map(maskPhone);

        // PERMANENT STABILITY FIX: Return Layer 1 results immediately (Latency resolution)
        res.json({
            person: {
                ...person,
                name,
                location: location || person.location,
                description: finalDescription,
                aiSummary: aiSummary,
                emails: maskedEmails,
                phoneNumbers: maskedPhones,
                unmaskedEmails: finalEmails, // Keeping for potential interior logic needs
                unmaskedPhones: finalPhones,
                enrichmentRecord: enrichmentResult
            },
            socials: socialProfiles,
            localData: localResults,
            externalDocuments: externalDocuments || [],
            allSearchItems: allSearchItems // Need this for Layer 2 verification
        });
    } catch (err) {
        console.error("Deep search Layer 1 failed:", err);
    }
});



// --- PERMANENT STABILITY FIX: Layer 2 Verification (Heavy Tasks) ---
router.post("/verify", async (req, res) => {
    const { person, socials, allSearchItems } = req.body;
    const name = person?.name;

    try {
        console.log(`[Deep Search] Starting Layer 2 (Heavy) for: ${name}`);

        // 2. ENRICHMENT: Skipped in Layer 2 (Now consolidated in Layer 1 for reliability)
        const enrichedEmails = person.emails || [];
        const enrichedPhones = person.phoneNumbers || [];

        // 2. PROBE: Perform targeted Instagram discovery for the SELECTED candidate
        let discoveredInstagram = null;
        try {
            const instagramResults = await instagramService.identify(name, enrichedEmails, enrichedPhones);
            if (instagramResults && instagramResults.length > 0) {
                const bestIg = instagramResults[0]; // Take the top verified match
                discoveredInstagram = {
                    platform: "Instagram",
                    url: bestIg.url,
                    handle: bestIg.handle,
                    username: `@${bestIg.handle}`,
                    title: `Instagram Profile (${bestIg.reason})`,
                    identityScore: bestIg.confidence,
                    aiVerified: bestIg.confidence >= 80
                };
                console.log(`[Deep Search] Targeted IG found for ${name}: @${bestIg.handle}`);
            }
        } catch (igErr) {
            console.error(`[Deep Search] Targeted IG probe failed: ${igErr.message}`);
        }

        // 3. MERGE: Add discovered IG to the socials list for AI synthesis and UI
        const finalSocials = [...(socials || [])];
        if (discoveredInstagram && !finalSocials.find(s => s.platform === "Instagram")) {
            finalSocials.push(discoveredInstagram);
        }

        // 4. Identify Anchor for Image Verification
        let identityAnchor = null;
        const potentialAnchors = [];
        const linkedInProfile = finalSocials.find(s => s.platform?.toLowerCase() === 'linkedin');
        if (linkedInProfile?.thumbnail) potentialAnchors.push(linkedInProfile.thumbnail);
        if (person.primaryImage) potentialAnchors.push(person.primaryImage);

        const anchorResults = await Promise.all(
            potentialAnchors.map(async url => ({ url, hasFace: await detectHumanFace(url) }))
        );
        identityAnchor = anchorResults.find(a => a.hasFace)?.url || null;

        // TIER 2: Secondary Anchor (Wikipedia/Knowledge Images from local records)
        if (!identityAnchor) {
            const knowledgeImg = socials.find(s => s.platform?.toLowerCase() === 'wikipedia' || s.source?.toLowerCase() === 'knowledgebase')?.thumbnail;
            if (knowledgeImg && await detectHumanFace(knowledgeImg)) {
                identityAnchor = knowledgeImg;
            }
        }

        // 2. Parallel AI Summary Start
        const aiSummaryPromise = (async () => {
            // FILTER: Only include social profiles that have passed identity verification
            const verifiedSocials = finalSocials.filter(s => s.identityScore >= 45 || s.aiVerified === true);

            // CLEAN: Remove generic placeholders from description
            const cleanDescription = (person.description || "").replace(/Web result|Intelligence Synthesis Target|no description available/gi, "").trim();

            const summaryParts = [
                `Target Name: ${person.name}`,
                `Focus Context: ${person.company || person.keywordMatched || "General Profile"}`,
                `Professional Role: ${cleanDescription || "Professional"}`,
                `Location: ${person.location || "Not specified"}`,
                `Verified Digital Presence: ${verifiedSocials.map(s => `${s.platform}: ${s.url} (${s.bio || s.title || "Profile"})`).join("\n")}`
            ];

            const prompt = `You are a senior intelligence analyst. Generate an accurate professional dossier summary for ${name}.
            
STRICT GROUNDING RULE: Use ONLY information that relates to the person's focus context (${person.company || person.keywordMatched}). 
If a social profile contradicts this context, ignore it.

AVAILABLE INTELLIGENCE:
${summaryParts.join("\n")}

Synthesize these data points into a concise, 2-paragraph professional summary. Paragraph 1 should focus on career and primary identity. Paragraph 2 should focus on digital footprint and professional affiliations.`;

            return await generateText(prompt).catch(() => "Summary generation unavailable.");
        })();

        // 3. Image Verification Pipeline (Layer 2)
        const candidateImages = [];
        socials.forEach(s => {
            if (s.thumbnail) candidateImages.push({
                url: s.thumbnail,
                score: 100,
                source: s.platform,
                type: 'profile',
                title: s.username || name,
                link: s.url
            });
        });

        allSearchItems.forEach(r => {
            if (r.images) {
                r.images.forEach(imgUrl => {
                    const norm = normalizeImageUrl(imgUrl);
                    if (norm) candidateImages.push({
                        url: norm.original,
                        thumbnail: norm.thumbnail,
                        score: 50,
                        source: r.provider || 'Web',
                        type: 'organic',
                        title: r.title || r.text,
                        link: r.link || r.url
                    });
                });
            }
        });

        const verificationList = candidateImages.sort((a, b) => b.score - a.score).slice(0, 15);
        const finalGallery = [];
        const seenUrls = new Set();

        const verifiedImages = await batchWithPacing(verificationList, async (img) => {
            const currentUrl = img.url;
            const hasFace = await detectHumanFace(currentUrl);
            if (!hasFace) return { ...img, isBlocked: true };

            if (identityAnchor) {
                const similarity = await verifyFaceSimilarity(identityAnchor, currentUrl);

                // MAV 2.0: Weighted Identity Scoring
                // If the image source has a strong name match, we accept a slightly lower similarity (75)
                const nameParts = (name || "").toLowerCase().split(" ").filter(p => p.length > 2);
                const isNameMatch = nameParts.length > 0 && nameParts.every(part =>
                    (img.title || "").toLowerCase().includes(part) ||
                    (img.link || "").toLowerCase().includes(part)
                );

                const threshold = isNameMatch ? 75 : 85;
                if (similarity < threshold) return { ...img, isBlocked: true };

                return { ...img, similarity, isBlocked: false };
            }
            return { ...img, isBlocked: true }; // NO ANCHOR = NO IMAGE
        }, 3, 150);

        verifiedImages.forEach(img => {
            if (img && !img.isBlocked && !seenUrls.has(img.url)) {
                seenUrls.add(img.url);
                finalGallery.push({
                    original: img.url,
                    thumbnail: img.thumbnail || img.url,
                    source: img.source,
                    similarity: img.similarity
                });
            }
        });

        const aiSummary = await aiSummaryPromise;

        res.json({
            images: finalGallery,
            aiSummary: aiSummary,
            primaryImage: finalGallery[0]?.original || person.primaryImage || "",
            enrichedSocials: finalSocials // Return updated list with discovered IG
        });
    } catch (err) {
        console.error("Verification Layer 2 failed:", err);
        res.status(500).json({ error: "Verification failed" });
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