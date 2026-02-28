import fetch from 'node-fetch';

async function compareCases() {
    const url = 'http://localhost:5000/api/multi-search/deep';

    const cases = [
        { name: "Elon Musk", desc: "Tesla SpaceX" },
        { name: "Mihir Doshi", desc: "Cyhex Infotech" }
    ];

    for (const testCase of cases) {
        console.log(`\n--- Testing Case: ${testCase.name} ---`);
        const payload = {
            person: {
                name: testCase.name,
                description: testCase.desc,
                location: "India",
                sources: ["Internet"],
                confidence: "High",
                phoneNumbers: [],
                emails: []
            }
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                console.error(`Error: ${res.status}`);
                continue;
            }

            const data = await res.json();
            console.log("Primary Image:", data.person.primaryImage);
            console.log("Images Count:", data.images.length);
            console.log("Sample Images:", data.images.slice(0, 5));

            // Analyze domains
            const domains = data.images.map(img => {
                try { return new URL(img).hostname; } catch (e) { return "invalid"; }
            });
            const domainCounts = domains.reduce((acc, d) => {
                acc[d] = (acc[d] || 0) + 1;
                return acc;
            }, {});
            console.log("Domain Distribution:", domainCounts);

        } catch (err) {
            console.error("Fetch failed:", err);
        }
    }
}

compareCases();
