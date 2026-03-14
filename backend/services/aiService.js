import Groq from "groq-sdk";
import dotenv from "dotenv";

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
      You are an expert entity resolution system. Your task is to identify unique individuals from a list of search results.
      
      STEPS:
      1. Analyze all search results.
      2. Cluster results that refer to the SAME person.
      3. For a NAME search, focus on resolving the specific individual.
      4. For a PHONE/CONTACT search, look for the person most strongly associated with that number (e.g., in directory listings, bios, or contact pages).
      5. FORMAT RULE: The 'name' field MUST be in the format "Full Name - Keyword" (e.g. "Pankaj Rathod - SBMP", "Pankaj Shah - CEO").
      6. Include the primary 'url' (e.g. LinkedIn or personal site) for that specific person.
      7. Limit the list to top 20 candidates.
      8. If no candidates are found that match the criteria, return "No confident candidates found".
      
      EXCLUSION RULES (CRITICAL):
      - Do NOT create a candidate entry for individual social media POSTS, STATUSES, or TWEETS.
      - URLs containing "/posts/", "/status/", "/p/", "story.php", or titles like "... / Posts / X", "... on Facebook" are POSTS, not person profiles.
      - Only return candidates that represent an actual person's profile, directory listing, or bio page.
      - If a search result is clearly a single post or status update (not a profile page), IGNORE it entirely.
      
      OUTPUT FORMAT:
      Return a JSON array of up to 4 distinct identity candidate objects.
      Each object MUST have:
      {
          "name": "Full Name",
          "description": "Short profession/role summary",
          "location": "City, Country (if known)",
          "company": "Current organization",
          "url": "A primary social or profile URL",
          "confidence": "Low/Medium/High",
          "reasoning": "Briefly why this matches"
      }
      
      Strategy: 
      - Prioritize official profiles (LinkedIn, GitHub, Portfolio).
      - Look for cross-platform clues (e.g. if a snippet mentions 'Twitter: @user', identify that user).
      - If name collisions are likely, use location/profession to filter.
      - Ensure results are actual human profiles, not organization pages.
      
      Strictly return ONLY the JSON array. No markdown.
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
            model: "llama-3.1-8b-instant",
            temperature: 0.3,
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

        try {
            const parsed = JSON.parse(text);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error("Failed to parse AI response as JSON:", text);
            return [];
        }
    } catch (error) {
        console.error("AI Service Error (Hang/Timeout/Failure):", error.message);
        // Return empty array on timeout to allow search to proceed with local/raw results
        return [];
    }
};


/**
 * Generate text using Groq AI
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export const generateText = async (prompt) => {
    if (!process.env.GROQ_API_KEY) {
        console.error("GROQ_API_KEY is missing in environment variables.");
        throw new Error("AI Service configuration error");
    }

    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Groq API Timeout (generateText)")), 25000)
        );

        const groqCall = groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `You are a senior intelligence research analyst producing professional dossier summaries.

Your task is to synthesize all available data into a comprehensive, structured profile summary.

GUIDELINES:
- Write 150-200 words organized into 2-3 focused paragraphs.
- Paragraph 1: Professional identity — role, company, industry, and career trajectory.
- Paragraph 2: Digital presence — notable platforms, public activity, and professional networks.
- Paragraph 3 (if data supports): Key findings — awards, publications, affiliations, or unique intelligence.
- FORMATTING: Use **bolding** for names, companies, and key roles. Use bullet points for specific achievements or highlights. Use clear headers if necessary.
- Use specific facts from the data. Never fabricate details not present in the source material.
- Reference data sources naturally (e.g., "LinkedIn presence indicates...", "Public records suggest...").
- Maintain a neutral, analytical tone. No filler phrases like "Based on available data" at the start.
- If data is sparse, write a shorter but still substantive summary. Do not pad with generic text.`
                },
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
      - If the Target context mentions "Company A" but the Candidate's snippet mentions "Company B" with no overlap, score BELOW 30.
      - Social media profiles with matching names but no professional context overlap should score BELOW 40.
      
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
