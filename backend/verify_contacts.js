
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testApollo() {
    console.log("--- Testing Apollo ---");
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) {
        console.log("No Apollo API Key found.");
        return;
    }

    try {
        console.log("Attempting Apollo Match with Header FIX...");
        const response = await axios.post('https://api.apollo.io/v1/people/match', {
            full_name: "Dhruvil Jain",
            domain: "google.com"
        }, { 
            headers: { 
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 10000 
        });

        console.log("Apollo Status:", response.status);
        console.log("Apollo Email:", response.data?.person?.email || "No email found");
    } catch (err) {
        console.error("Apollo Failed:", err.response?.data || err.message);
    }
}

async function testSnov() {
    console.log("\n--- Testing Snov ---");
    const clientId = process.env.SNOV_CLIENT_ID;
    const clientSecret = process.env.SNOV_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        console.log("No Snov Credentials found.");
        return;
    }

    try {
        console.log("Attempting Snov Token...");
        const tokenRes = await axios.post('https://api.snov.io/v1/get-access-token', {
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret
        });

        const token = tokenRes.data?.access_token;
        console.log("Snov Token received:", token ? "Yes" : "No");
        if (!token) return;

        console.log("Attempting Snov Email Lookup...");
        const response = await axios.get('https://api.snov.io/v1/get-emails-from-names', {
            params: {
                firstName: "Dhruvil",
                lastName: "Jain",
                domain: "google.com"
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
        });

        console.log("Snov Status:", response.status);
        if (response.data && response.data.data) {
            console.log("Snov Email:", response.data.data.email || "No email found");
        } else {
            console.log("Snov Response Data Missing:", JSON.stringify(response.data));
        }
    } catch (err) {
        console.error("Snov Failed:", err.response?.data || err.message);
    }
}

async function run() {
    await testApollo();
    await testSnov();
}

run();
