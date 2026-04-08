import { performSearch } from "./routes/multiSearch.js";
import dotenv from "dotenv";
dotenv.config();

async function testTraceV2() {
    const name = "Elon Musk";
    const identityContext = { name, location: "", keywords: "", number: "" };
    console.log(`--- TRACING performSearch for "${name}" ---`);
    
    try {
        const results = await performSearch(name, false, identityContext, false);
        console.log(`\n--- TRACE COMPLETE ---`);
        console.log(`Final candidates returned: ${results.length}`);
        results.forEach((r, i) => {
            console.log(`[${i}] ${r.title} (${r.source}) - ${r.url}`);
        });
    } catch (err) {
        console.error("Trace failed with error:", err.message);
    }
}

testTraceV2();
