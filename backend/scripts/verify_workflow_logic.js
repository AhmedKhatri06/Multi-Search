import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/multi-search';

async function testWorkflow() {
    console.log("--- STARTING WORKFLOW VERIFICATION ---");

    try {
        // Stage 1: Identify
        console.log("\n1. Testing Identification (/identify)...");
        const identifyRes = await axios.post(`${BASE_URL}/identify`, { name: 'Elon Musk' });
        console.log("Status:", identifyRes.status);
        if (Array.isArray(identifyRes.data)) {
            console.log("Candidates Found:", identifyRes.data.length);
            console.log("First Candidate:", identifyRes.data[0].name);
        } else {
            console.error("Error: Identification did not return an array.");
            return;
        }

        // Stage 2: Deep Search (using the first candidate)
        const candidate = identifyRes.data[0];
        console.log(`\n2. Testing Deep Search (/deep) for: ${candidate.name}...`);
        const deepRes = await axios.post(`${BASE_URL}/deep`, { person: candidate });
        console.log("Status:", deepRes.status);
        if (deepRes.data && deepRes.data.person) {
            console.log("Success: Deep data retrieved.");
            console.log("Images found:", deepRes.data.images?.length || 0);
            console.log("Socials found:", deepRes.data.socials?.length || 0);
            console.log("AI Summary:", deepRes.data.aiSummary?.message);
        } else {
            console.error("Error: Deep search response malformed.");
        }

    } catch (err) {
        console.error("Verification failed!");
        if (err.response) {
            console.error("Response Status:", err.response.status);
            console.error("Response Data:", JSON.stringify(err.response.data));
        } else {
            console.error("Error Message:", err.message);
        }
    }

    console.log("\n--- VERIFICATION FINISHED ---");
}

testWorkflow();
