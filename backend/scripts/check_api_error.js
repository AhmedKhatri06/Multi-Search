import axios from "axios";

async function checkApi() {
    try {
        console.log("Testing API to see error details...");
        // Purposefully trigger the error by searching "Elon" which we know fails
        const response = await axios.post("http://localhost:5000/api/multi-search", {
            query: "Elon",
            includeInternet: true
        });

        console.log("✅ Success (Unexpected for now):", response.status);
        console.log(response.data);
    } catch (error) {
        if (error.response) {
            console.log(`❌ API Error (${error.response.status}):`);
            console.log(JSON.stringify(error.response.data, null, 2));

            if (error.response.data.details) {
                console.log("\n✅ GOOD: Server is running NEW code (Details present)");
            } else {
                console.log("\n⚠️ BAD: Server is running OLD code (No details)");
            }
        } else {
            console.error("❌ Connection failed:", error.message);
        }
    }
}

checkApi();
