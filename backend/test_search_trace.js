import { performSearch } from "./routes/multiSearch.js";
import dotenv from "dotenv";
dotenv.config();

async function testTrace() {
    const name = "Elon Musk";
    const identityContext = { name, location: "", keywords: "", number: "" };
    console.log(`Tracing performSearch for "${name}"...`);
    
    try {
        const results = await performSearch(name, false, identityContext, false);
        console.log(`\nFinal return count: ${results.length}`);
        results.forEach((r, i) => {
            console.log(`[${i}] Title: ${r.title} | Source: ${r.source}`);
        });
    } catch (err) {
        console.error("Trace failed:", err);
    }
}

testTrace();
