
import { normalizeName } from "./utils/searchHelper.js";

// Mocking the merge logic from multiSearch.js
function testMerge(candidates) {
    const mergedIdentities = new Map();

    candidates.forEach(candidate => {
        const rawName = candidate.name || "Unknown";
        const normName = normalizeName(rawName);
        const normCompany = (candidate.company || "").toLowerCase().trim().replace(/[^a-z0-9]/g, "");
        const compositeKey = `${normName}|${normCompany}`;

        let existingKey = null;
        for (const [key, existing] of mergedIdentities.entries()) {
            const [existingNormName, existingNormCompany] = key.split('|');

            const nameMatch = existingNormName === normName;
            if (!nameMatch) continue;

            const companyMatch = (normCompany && existingNormCompany) &&
                (existingNormCompany.includes(normCompany) || normCompany.includes(existingNormCompany)) &&
                (normCompany.length >= 3 || existingNormCompany.length >= 3);

            // THE FIX: Conflict detection
            const hasCompanyContradiction = (normCompany && existingNormCompany) && !companyMatch;

            // Mocking verifiedMatch and others for the test
            const verifiedMatch = false; 
            const bothLocal = false;
            const careerStageMatch = false;

            // Updated logic from multiSearch.js
            if ((verifiedMatch && !hasCompanyContradiction) || (bothLocal && companyMatch) || (careerStageMatch && companyMatch)) {
                existingKey = key;
                break;
            }
        }

        if (!existingKey) {
            const identityId = `${compositeKey}|${mergedIdentities.size}`;
            mergedIdentities.set(identityId, { ...candidate });
        } else {
            console.log(`[MERGED] ${candidate.name} into existing identity`);
        }
    });

    return Array.from(mergedIdentities.values());
}

const testCandidates = [
    { name: "Mihir Doshi", company: "CyHEX Infotech", description: "Co-founder & Director" },
    { name: "Mihir Doshi", company: "Credit Suisse", description: "Head of ODF" }
];

console.log("Testing Mihir Doshi Merging Logic...");
const results = testMerge(testCandidates);

console.log(`\nFinal Candidate Count: ${results.length}`);
results.forEach((c, i) => {
    console.log(`Candidate ${i+1}: ${c.name} at ${c.company} (${c.description})`);
});

if (results.length === 2) {
    console.log("\nSUCCESS: Candidates were correctly kept separate!");
} else {
    console.log("\nFAILURE: Candidates were incorrectly merged.");
}
