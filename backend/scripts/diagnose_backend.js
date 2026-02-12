
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import axios from "axios";

// Models & DB
import Document from "../models/Document.js";
import SearchCache from "../models/SearchCache.js";
import { sqliteSearch } from "../db/sqlite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// --- Helpers ---
function normalize(value = "") {
    return value.toString().toLowerCase().trim().replace(/\s+/g, " ");
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
            score += (4 - item.priority) * 10;
            if (item.source === "Internet") score += 5;
            return { ...item, score };
        })
        .sort((a, b) => b.score - a.score);
}

// --- Logic from performSearch ---
async function performSearch(query) {
    const normQuery = normalize(query);

    // Check Cache
    const cached = await SearchCache.findOne({ query: normQuery, type: "SEARCH" });
    if (cached) {
        console.log(`[CACHE HIT] Search: "${normQuery}"`);
        return cached.data;
    }

    // 1. Primary searches
    const queryWords = query.split(" ").filter(w => w.length > 1);
    const targetName = queryWords.length > 2 ? queryWords.slice(0, 2).join(" ") : queryWords[0] || query;
    const context = queryWords.length > 2 ? queryWords.slice(2).join(" ") : queryWords.slice(1).join(" ");

    let mongoResults = await Document.find({
        text: { $regex: query, $options: "i" }
    }).lean();

    let sqliteResults = await sqliteSearch(query);

    // Fallbacks omitted for brevity as they are for empty results

    let internetQuery = query;
    if (sqliteResults && sqliteResults.length > 0) {
        const p = sqliteResults[0];
        internetQuery = `${p.name} ${p.title || ""}`.trim();
    }

    // REAL INTERNET SEARCH – SERPAPI
    let internetResults = [];
    try {
        const profileSites = [
            "site:linkedin.com/in/", "site:instagram.com", "site:facebook.com",
            "site:twitter.com", "site:x.com", "site:bumble.com",
            "site:rocketreach.co/p/", "site:linkedin.com/posts/"
        ].join(" OR ");

        const socialQuery = `${internetQuery} (${profileSites})`.trim();

        console.log("Calling SerpAPI with key:", process.env.SERPAPI_KEY ? "PRESENT" : "MISSING");

        const response = await axios.get("https://serpapi.com/search", {
            params: {
                q: socialQuery,
                engine: "google",
                api_key: process.env.SERPAPI_KEY,
                num: 20
            }
        });

        const results = response.data?.organic_results || [];
        console.log(`[SerpAPI] Raw Results: ${results.length}`);

        results.forEach((item, index) => {
            let provider = "Google";
            const link = (item.link || "").toLowerCase();
            const title = (item.title || "").toLowerCase();
            const snippet = (item.snippet || "").toLowerCase();
            const nameLower = targetName.toLowerCase();
            const nameParts = nameLower.split(" ");
            const matchesMainName = title.includes(nameParts[0]) || snippet.includes(nameParts[0]);

            if (!matchesMainName) return;

            const isDirectory = link.includes("/pub/dir/") || link.includes("/search/");
            if (isDirectory) return;

            if (link.includes("linkedin.com")) provider = "LinkedIn";
            else if (link.includes("instagram.com")) provider = "Instagram";
            else if (link.includes("facebook.com")) provider = "Facebook";

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
        ...sqliteResults.map(doc => ({ id: doc.id, text: `${doc.name} - ${doc.title}`, source: "SQLite", type: "PROFILE", priority: 1, images: [doc.image].filter(Boolean) }))
    ].forEach(item => {
        const key = normalize(item.text);
        if (!localMap.has(key)) localMap.set(key, item);
    });
    const dedupedLocalResults = Array.from(localMap.values());

    const combined = [...dedupedLocalResults, ...dedupedInternetResults];
    const finalRanked = rankResults(combined, query);

    // Save to Cache
    try {
        // NOTE: We do not save to cache in diagnostic script to avoid side effects or errors
        // await SearchCache.create({ query: normQuery, type: "SEARCH", data: finalRanked });
    } catch (err) { }

    return finalRanked;
}

// --- Main Test Function ---
async function runDiagnostic() {
    try {
        console.log("MongoDB connecting...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected.");

        const query = "Elon";
        console.log(`\nSimulating API Request for query: "${query}"`);

        // 1. Perform Search
        console.log("Running performSearch...");
        const enrichedResults = await performSearch(query);
        console.log(`performSearch finished. got ${enrichedResults.length} results.`);

        // 2. Simulate Route Handler Post-Processing which crashes
        console.log("Running Route Logic...");

        const finalResults = enrichedResults.map(item => {
            let confidence = "Found Online";
            if (item.type === "PROFILE" || item.type === "RECORD") {
                confidence = "Verified (Local DB)";
            }
            return { ...item, confidence }; // <--- Potentially crashing here?
        });

        const groupedResults = {
            profile: finalResults.filter(r => r.type === "PROFILE"),
            records: finalResults.filter(r => r.type === "RECORD"),
            auxiliary: finalResults.filter(r => r.type === "AUX")
        };

        const images = [
            ...new Set(finalResults.flatMap(r => r.images || []).filter(Boolean))
        ];

        const responsePayload = {
            query,
            total: finalResults.length,
            images,
            profile: groupedResults.profile,
            records: groupedResults.records,
            auxiliary: groupedResults.auxiliary
        };

        console.log("\n✅ SUCCESS! Route logic completed without error.");
        console.log("Response Keys:", Object.keys(responsePayload));
        console.log("Auxiliary Count:", responsePayload.auxiliary.length);

    } catch (err) {
        console.error("\n❌ CRASH DETECTED!");
        console.error("Error Message:", err.message);
        console.error("Stack Trace:");
        console.error(err.stack);
    } finally {
        await mongoose.disconnect();
    }
}

runDiagnostic();
