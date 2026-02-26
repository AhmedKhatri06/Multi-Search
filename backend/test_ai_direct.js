import { identifyPeople, generateText } from './services/aiService.js';
import dotenv from 'dotenv';
dotenv.config();

async function testDirectAI() {
    console.log("Testing Groq AI directly...");

    // 1. Test Identification
    const dummyResults = [
        { title: "Sundar Pichai - Wikipedia", link: "https://en.wikipedia.org/wiki/Sundar_Pichai", snippet: "CEO of Google and Alphabet." },
        { title: "Sundar Pichai | LinkedIn", link: "https://www.linkedin.com/in/sundarpichai", snippet: "Executive Leader at Google." }
    ];

    try {
        console.time("AI Identification");
        const candidates = await identifyPeople({
            name: "Sundar Pichai",
            searchResults: dummyResults
        });
        console.timeEnd("AI Identification");
        console.log("Identification Response:", JSON.stringify(candidates, null, 2));

        // 2. Test Summary Generation
        console.log("\nTesting Summary Generation...");
        console.time("AI Summary");
        const summary = await generateText("Please summarize the career of Sundar Pichai in 20 words.");
        console.timeEnd("AI Summary");
        console.log("Summary Response:", summary);

    } catch (err) {
        console.error("AI Direct Test Failed:", err);
    }
}

testDirectAI();
