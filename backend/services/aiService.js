import Groq from "groq-sdk";
import dotenv from "dotenv";
import { ollamaGenerateText } from "./localSummary.js";

dotenv.config();

const groq = new Groq({ apiKey: (process.env.GROQ_API_KEY || "").trim() });

/**
 * Identifies people based on user criteria and search context.
 * @param {Object} params
 * @param {string} params.name
 * @param {string} [params.location]
 * @param {string} [params.keywords]
 * @param {Array} params.searchResults
 * @returns {Promise<Array|string>} Structured list of people or "No confident candidates found"
 */
export const identifyPeople = async ({ name, location, keywords, searchResults }) => {
    if (!process.env.GROQ_API_KEY) {
        console.error("GROQ_API_KEY is missing in environment variables.");
        throw new Error("AI Service configuration error");
    }

    const systemPrompt = `
      You are an expert entity resolution and identity disambiguation system. Your task is to identify ALL unique individuals from a list of search results.
      
      STEPS:
      1. Analyze all search results to find DIFFERENT people with the same name.
      2. IDENTITY DIVERSITY (CRITICAL): For common names (e.g. John Doe, Dhruvil Jain), the search results likely contain multiple DIFFERENT individuals. You MUST produce a separate candidate object for each distinct persona you identify based on their role, company, or location.
      3. For a NAME search, focus on resolving the list of potential candidates, not just one.
      4. For a PHONE/CONTACT search, look for the person most strongly associated with that number.
      5. FORMAT RULE: The 'name' field MUST be "Full Name".
      6. Include the primary 'url' (e.g. LinkedIn or personal site) for that specific person.
      7. Limit the list to top 12 candidates.
      
      IDENTITY CONSOLIDATION (SELECTIVE):
      - ONLY combine results into ONE candidate if they refer to the EXACT SAME individual.
      - **DOMAIN COLLISION (CRITICAL)**: If you find two people with the same name but DIFFERENT companies, professional roles, or industries (e.g. 'Software Engineer at Google' vs 'Director at a Hospital'), you MUST return them as separate objects.
      - **DO NOT** combine their descriptions into one string with a separator like '|' or '/'. This is a failure of disambiguation.
      - Rule of Thumb: If you aren't 95% sure they are the same person (e.g., matching LinkedIn and matching personal site context), list them as DISTINCT candidates.
      
      EXCLUSION RULES:
      - Do NOT create candidates for individual social media POSTS/STATUSES.
      - Ignore URLs containing "/posts/", "/status/", "/p/", or "story.php".
      
      OUTPUT FORMAT:
      Return a JSON array of distinct identity candidate objects.
      Each object MUST have:
      {
          "name": "Strict Name Only (e.g. Sundar Pichai. NO titles like CEO or Dr.)",
          "description": "EXTREMELY CONCISE tagline (Maximum 4-5 words. e.g. 'CEO at Google' or 'Student at Stanford')",
          "location": "City, Country (if known)",
          "company": "Current organization (1-2 words. Be specific, e.g. 'CyHEX' or 'Credit Suisse')",
          "url": "A primary social or profile URL",
          "socials": [{"platform": "LinkedIn", "url": "..."}, {"platform": "Twitter", "url": "..."}],
          "confidence": "Low/Medium/High",
          "reasoning": "Quick reason why this is a distinct persona"
      }
      
      IDENTITY INTEGRITY RULES:
      - **SURNAME INTEGRITY (CRITICAL)**: For names like 'Mihir Doshi', do NOT include results for 'Mihir Desai'. A surname mismatch is a completely different person.
      - "name": MUST be ONLY the person's full name. 
      - "description": Keep it extremely concise. 4-5 words maximum. Do NOT string multiple roles together.
      
      Strategy: 
      - Use exact surname matching to distinguish between people with the same first name.
      - Prioritize profile links over news articles.
      - Strictly return ONLY the JSON array. No markdown.
    `;

    const prompt = `
Criteria:
- Name: ${name}
- Location: ${location || "Not specified"}
- Keywords: ${keywords || "Not specified"}

Search Results:
${JSON.stringify(searchResults, null, 2)}
`;

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Groq API Timeout")), 25000)
        );

        const groqCall = groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1, // Lower temperature for stricter disambiguation
        });

        // Race the Groq call against a 25s timeout
        const chatCompletion = await Promise.race([groqCall, timeout]);

        let text = chatCompletion.choices[0]?.message?.content?.trim() || "";

        // Safety check for common AI formatting
        if (text.startsWith("```")) {
            text = text.replace(/```(json)?/g, "").replace(/```/g, "").trim();
        }

        if (text.includes("No confident candidates found")) {
            return [];
        }

        const jsonMatch = text.match(/\[\s*\{.*\}\s*\]/s);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                const candidates = Array.isArray(parsed) ? parsed : [];
                
                // --- STRUCTURAL DISAMBIGUATION: Check for 'Merged' candidates ---
                const finalizedCandidates = [];
                candidates.forEach(c => {
                    const desc = (c.description || "").toLowerCase();
                    // Detect common "Merger" patterns like pipes, slashes, or double company mentions
                    const hasMergerPattern = desc.includes('|') || desc.includes('/') || (desc.includes(' and ') && desc.split(' and ').length > 1 && desc.includes(' at '));
                    
                    if (hasMergerPattern && (c.socials?.length > 1 || desc.length > 50)) {
                        console.log(`[AI Discovery] Merged candidate detected: ${c.name}. Splitting...`);
                        const parts = c.description.split(/[|/]/).map(p => p.trim());
                        parts.forEach((p, idx) => {
                            finalizedCandidates.push({
                                ...c,
                                description: p,
                                company: p.split(/ at /i)[1]?.trim() || c.company,
                                url: c.socials?.[idx]?.url || c.url,
                                reasoning: `Divergent identity split: ${p} (Original: ${c.description})`
                            });
                        });
                    } else {
                        finalizedCandidates.push(c);
                    }
                });
                
                return finalizedCandidates;
            } catch (e) {
                console.error("Failed to parse regex-extracted JSON:", jsonMatch[0]);
            }
        }

        console.error("No JSON array found in AI response:", text);
        return [];
    } catch (error) {
        console.error("AI Service Error (Hang/Timeout/Failure):", error.message);
        return [];
    }
};


/**
 * Generate text using Groq AI
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export const generateText = async (prompt) => {
    const SUMMARY_SYSTEM_PROMPT = `You are an expert identity intelligence analyst. Your goal is to synthesize multiple data points into a high-quality, professional executive summary for an individual's dossier.
    
    GUIDELINES:
    1. **SYNTHESIS OVER REPETITION**: Do not simply list or copy-paste raw data from the sources. Connect the dots to explain WHO the person is, their professional trajectory, and their key areas of expertise.
    2. **NATURAL LANGUAGE**: Use a sophisticated, professional tone. Avoid starting with lists.
    3. **STRUCTURE**:
       - Paragraph 1: Core professional identity, current leadership role, and primary industry impact.
       - Paragraph 2: Notable achievements, digital footprint, or academic/professional milestones found across the web.
    4. **VISUAL CLARITY**: Use **bolding** for for names, key companies, and significant technologies.
    5. **CLEAN OUTPUT**: Do not include any meta-tags like /human or /summary in the final output.`;

    // --- Try Ollama first (local, free, unlimited) ---
    try {
        const ollamaResult = await ollamaGenerateText(prompt, SUMMARY_SYSTEM_PROMPT, {
            temperature: 0.5,
            timeoutMs: 25000
        });
        if (ollamaResult) {
            console.log("[AI] Summary generated via Ollama (local)");
            return ollamaResult;
        }
    } catch (e) {
        console.warn("[AI] Ollama summary attempt failed, falling back to Groq:", e.message);
    }

    // --- Fallback to Groq ---
    if (!process.env.GROQ_API_KEY) {
        console.error("GROQ_API_KEY is missing and Ollama is unavailable.");
        return "";
    }

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Groq API Timeout (generateText)")), 25000)
        );

        const groqCall = groq.chat.completions.create({
            messages: [
                { role: "system", content: SUMMARY_SYSTEM_PROMPT },
                { role: "user", content: prompt }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.5,
        });

        const chatCompletion = await Promise.race([groqCall, timeout]);
        return chatCompletion.choices[0]?.message?.content || "";
    } catch (error) {
        console.error("AI generateText Error (Hang/Timeout/Failure):", error.message);
        return ""; // Return empty string to allow UI to render without summary
    }
};

/**
 * Verifies if a search result belongs to the target person based on context.
 * @param {Object} params
 * @param {string} params.targetName - Full name of the person being searched
 * @param {string} params.targetContext - Biography, company, or role of the searched person
 * @param {Object} params.candidate - The search result to verify (title, snippet, url)
 * @returns {Promise<Object>} Verification result { isMatch: boolean, score: number, reasoning: string }
 */
export const verifyIdentityMatch = async ({ targetName, targetContext, candidate }) => {
    if (!process.env.GROQ_API_KEY) return { isMatch: true, score: 100, reasoning: "AI Key missing" };

    const systemPrompt = `
      You are a specialized Identity Verification System.
      Your goal is to determine if a search result (Candidate) refers to the EXACT SAME individual as the Target.
      
      MATCH CRITERIA (ALL must be evaluated):
      1. Name similarity (accounting for middle names, abbreviations, transliterations).
      2. Career/Professional alignment (company, role, industry MUST overlap).
      3. Education/University matching (if available).
      4. Location consistency (must not contradict if both specify different countries/cities).
      
      NAME COLLISION DETECTION (CRITICAL):
      - Many people share the same name. A name match alone is NOT sufficient.
      - If the candidate's bio/snippet mentions a DIFFERENT company, role, or industry than the Target's context, it is likely a DIFFERENT person.
      - **HANDLE CORRELATION (NEW)**: If the URL handle (e.g., @elonmusk, @sundarpichai) strongly matches the target name, be more lenient with snippet context. High-profile, established handles are rarely duplicates.
      - **OFFICIAL MARKERS**: If the candidate title or snippet uses terms like "Official", "Verified", "CEO", "Founder", or "Profile", it is more likely to be a match for a high-profile target.
      - Rule: If the handles match and the name matches, but professional keywords are missing in the brief snippet, score ABOVE 80 (Identity Probable).
      - If the Target context mentions "Company A" but the Candidate's snippet mentions "Company B" with no overlap, score BELOW 30.
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "isMatch": boolean,
        "score": number (0-100),
        "reasoning": "1 sentence explanation"
      }
    `;

    const prompt = `
      TARGET PERSON:
      Name: ${targetName}
      Context: ${targetContext}

      CANDIDATE RESULT:
      Title: ${candidate.title}
      Snippet: ${candidate.snippet || candidate.text}
      URL: ${candidate.url || candidate.link}
    `;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.1, // Low temperature for consistency
        });

        let text = chatCompletion.choices[0]?.message?.content?.trim() || "";

        // Safety check for common AI formatting
        if (text.startsWith("```")) {
            text = text.replace(/```(json)?/g, "").replace(/```/g, "").trim();
        }

        const jsonMatch = text.match(/\{.*\}/s);

        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { isMatch: true, score: 50, reasoning: "Failed to parse AI response" };
    } catch (error) {
        console.error("verifyIdentityMatch Error:", error.message);
        return { isMatch: true, score: 50, reasoning: "API Error: " + error.message };
    }
};

/**
 * Verifies if an extracted email address belongs to the target person.
 * Uses AI to evaluate context around the email in the source snippet.
 * @param {Object} params
 * @param {string} params.targetName - Full name of the person being searched
 * @param {string} params.targetContext - Professional context of the target
 * @param {string} params.email - The email address to verify
 * @param {string} params.sourceSnippet - The text snippet where the email was found
 * @returns {Promise<Object>} { isOwner: boolean, confidence: 'high'|'medium'|'low', reasoning: string }
 */
export const verifyEmailOwnership = async ({ targetName, targetContext, email, sourceSnippet }) => {
    if (!process.env.GROQ_API_KEY) return { isOwner: false, confidence: 'low', reasoning: 'AI Key missing' };

    const systemPrompt = `
      You are an Email Ownership Verification System.
      Given a Target person and an email found in a text snippet, determine if the email belongs to the Target.
      
      RULES:
      - If the email prefix contains parts of the Target's name (e.g., "pankaj.r" for "Pankaj Rathod"), lean towards ownership.
      - If the email prefix contains a DIFFERENT person's name (e.g., "chintan222" for target "Pankaj Rathod"), it is NOT the target's email.
      - If the snippet explicitly associates the email with the Target ("Contact Pankaj at pankaj@..."), it IS the target's email.
      - If the snippet lists multiple people and multiple emails, only match emails that are directly adjacent to or associated with the Target's name.
      - When uncertain, default to isOwner: false.
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "isOwner": boolean,
        "confidence": "high" | "medium" | "low",
        "reasoning": "1 sentence explanation"
      }
    `;

    const prompt = `
      TARGET: ${targetName}
      CONTEXT: ${targetContext}
      EMAIL: ${email}
      SOURCE SNIPPET: ${sourceSnippet}
    `;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: prompt }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.1,
        });

        let text = chatCompletion.choices[0]?.message?.content?.trim() || "";
        if (text.startsWith("```")) {
            text = text.replace(/```(json)?/g, "").replace(/```/g, "").trim();
        }

        const jsonMatch = text.match(/\{.*\}/s);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        return { isOwner: false, confidence: 'low', reasoning: 'Failed to parse AI response' };
    } catch (error) {
        console.error("verifyEmailOwnership Error:", error.message);
        return { isOwner: false, confidence: 'low', reasoning: 'API Error: ' + error.message };
    }
};
