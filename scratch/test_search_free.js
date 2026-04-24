import { searchFree } from '../backend/utils/freeSearch.js';

async function test() {
    console.log("Testing searchFree with 'Sachin Tendulkar'...");
    try {
        const results = await searchFree("Sachin Tendulkar");
        console.log(`Found ${results.length} results.`);
        results.forEach((r, i) => {
            console.log(`[${i}] ${r.title} - ${r.url}`);
        });
    } catch (err) {
        console.error("Test failed:", err);
    }
}

test();
