
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import axios from "axios";
import SearchCache from "../models/SearchCache.js";
import Document from "../models/Document.js";
import { sqliteSearch } from "../db/sqlite.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// MOCK Helpers
function normalize(value = "") {
    return value.toString().toLowerCase().trim().replace(/\s+/g, " ");
}

function extractSocialAccounts(results, name, keywords, location) {
    // Mock extraction logic for test
    return results.map(r => ({
        platform: r.link.includes("linkedin") ? "LinkedIn" : "Web",
        url: r.link,
        username: "test_user"
    })).slice(0, 3);
}

// MOCK performSearch from the recent edit
async function performSearch(query, simpleMode = false) {
    console.log(`[Mock] performSearch('${query}', ${simpleMode})`);

    // Simulate finding NO local data (as confirmed before)
    const localResults = [];

    // Simulate finding Internet data
    const internetResults = [
        { title: "Pankaj Udhas - Wikipedia", text: "Pankaj Udhas is a singer...", url: "https://en.wikipedia.org/wiki/Pankaj_Udhas", source: "Internet", provider: "Wikipedia" },
        { title: "Pankaj | LinkedIn", text: "Pankaj Profile", url: "https://www.linkedin.com/in/pankaj", source: "Internet", provider: "LinkedIn" }
    ];

    return [...localResults, ...internetResults];
}

// THE DEEP SEARCH LOGIC TO TEST
async function runDeepLogic() {
    const person = { name: "Pankaj", description: "Singer", location: "Mumbai" };
    console.log("Simulating /deep request for:", person);

    try {
        const name = person.name;
        const profession = person.description || "";
        const location = person.location || "";

        // 1. Broad search for everything
        const baseQuery = `${name} ${profession} ${location}`.trim();
        const rawResults = await performSearch(baseQuery, false);

        // 2. Separate Local vs Internet
        const localResults = rawResults.filter(r => r.source === "MongoDB" || r.source === "SQLite");
        const internetResults = rawResults.filter(r => r.source === "Internet");

        // 3. Extract social accounts using strict service
        const formattedForService = internetResults.map(r => ({
            title: r.title,
            snippet: r.text,
            link: r.url
        }));

        const socialAccounts = extractSocialAccounts(
            formattedForService,
            name,
            [profession],
            location
        );

        // 4. Extract articles (news or blog posts)
        const articles = internetResults
            .filter(r => r.provider === "Google" || r.provider === "Wikipedia") // Adjusted for mock
            .map(r => ({
                title: r.title,
                snippet: r.text,
                url: r.url
            }));

        const response = {
            person,
            localData: localResults, // Send local data separately
            socials: socialAccounts,
            articles: articles.slice(0, 5),
            rawInternet: internetResults
        };

        console.log("\n=== RESPONSE PREVIEW ===");
        console.log("Keys:", Object.keys(response));
        console.log("Local Data (Expect Array):", Array.isArray(response.localData));
        console.log("Local Data Length:", response.localData.length);
        console.log("Socials:", response.socials.length);

        if (!response.localData) {
            console.error("❌ FAILURE: localData is missing from response!");
        } else {
            console.log("✅ SUCCESS: Structure looks correct.");
        }

    } catch (err) {
        console.error("DeepSearch logic failed:", err);
    }
}

runDeepLogic();
