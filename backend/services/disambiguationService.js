import { generateText } from './aiService.js';

export async function identifyPeople(searchResults, query) {
    const context = searchResults.map(r => ({
        title: r.title,
        snippet: r.snippet,
        source: r.source
    })).slice(0, 10);

    const prompt = `You are an intelligent assistant helping me identify people.

Your task:
1. Analyze the search results context
2. Return a list of possible people matching this information
3. For each person, provide:
   - Name (full name from search result)
   - Short description (role, company, or key identifier)
   - Location (if known)
   - Source confidence (low/medium/high)
4. Limit to 3-5 people
5. If no clear match, return "No confident candidates found"

Search Query: ${query}

Search Results Context:
${JSON.stringify(context, null, 2)}

Output format: JSON array only, no markdown. Example:
[
  {
    "name": "John Doe",
    "description": "Software Engineer at Google",
    "location": "San Francisco",
    "confidence": "high"
  }
]`;

    try {
        const response = await generateText(prompt);
        let cleanedResponse = response.trim();

        // Remove markdown code blocks if present
        if (cleanedResponse.startsWith('```')) {
            cleanedResponse = cleanedResponse.replace(/```json?\n?/g, '').replace(/```\n?$/g, '');
        }

        const candidates = JSON.parse(cleanedResponse);

        if (Array.isArray(candidates) && candidates.length > 0) {
            return candidates;
        }

        return [];
    } catch (error) {
        console.error('Error in identifyPeople:', error);

        // Fallback: Create candidates from local database results
        const localCandidates = searchResults
            .filter(r => r.source && r.source.includes('local'))
            .slice(0, 5)
            .map(r => ({
                name: r.title || query,
                description: r.snippet || 'Person from local database',
                location: '',
                confidence: 'medium'
            }));

        if (localCandidates.length > 0) {
            console.log('Using fallback disambiguation with local results');
            return localCandidates;
        }

        return [];
    }
}

export async function generateSummary(personData, query) {
    const { localData, internetResults, socialAccounts } = personData;

    const context = {
        localData: localData.slice(0, 5),
        internetSnippets: internetResults.slice(0, 10).map(r => r.snippet),
        socialPlatforms: socialAccounts.map(s => s.platform)
    };

    const prompt = `You are an AI assistant creating a professional summary about a person.

Your task:
1. Create a concise, professional summary (2-4 paragraphs)
2. Include professional background, role, company, achievements
3. Mention social media presence if relevant
4. Use ONLY verified information from provided sources
5. If information is limited, keep summary brief and factual
6. DO NOT make assumptions or add unverified information
7. Write in third person, professional tone

Search Query: ${query}

Available Information:
${JSON.stringify(context, null, 2)}

Output: Summary text only, no markdown`;

    try {
        const summary = await generateText(prompt);
        return summary.trim();
    } catch (error) {
        console.error('Error generating summary:', error);
        return 'Unable to generate summary at this time.';
    }
}
