import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Execute multiple dork queries via Serper and aggregate unique results.
 * Each dork is a separate API call; results are merged and deduplicated by URL.
 * 
 * @param {string[]} dorks - Array of Google Dork query strings
 * @param {number} [numPerQuery=10] - Number of results per query
 * @returns {Object[]} Deduplicated search results
 */
export async function searchWithDorks(dorks, numPerQuery = 10) {
    if (!dorks || dorks.length === 0) return [];

    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) {
        console.error('[Dorking] SERPER_API_KEY not configured');
        return [];
    }

    console.log(`[Dorking] Executing ${dorks.length} dork queries...`);

    const promises = dorks.map(async (dork, index) => {
        try {
            // TIGHTENING: Serper has a character limit for queries (usually 256-512)
            // We cap at 256 to be safe and avoid 400 Bad Request
            const safeDork = dork.length > 256 ? dork.substring(0, 256).trim() : dork;
            
            console.log(`  [Dork ${index + 1}] ${safeDork.slice(0, 80)}...`);
            const response = await axios.post('https://google.serper.dev/search', {
                q: safeDork,
                num: numPerQuery
            }, {
                headers: {
                    'X-API-KEY': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const results = response.data?.organic || [];
            console.log(`  [Dork ${index + 1}] Got ${results.length} results`);

            return results.map((item, i) => ({
                id: `dork-${index}-${i}`,
                title: item.title || 'Untitled',
                text: item.snippet || '',
                snippet: item.snippet || '',
                url: item.link || '',
                link: item.link || '',
                source: 'Internet',
                provider: 'Google Dork',
                type: 'AUX',
                priority: 3,
                images: item.imageUrl ? [item.imageUrl] : [],
                dorkQuery: dork
            }));
        } catch (err) {
            console.error(`  [Dork ${index + 1}] Failed: ${err.message}`);
            return [];
        }
    });

    const allResults = await Promise.all(promises);

    // Deduplicate by URL
    const seenUrls = new Map();
    for (const results of allResults) {
        for (const item of results) {
            const normalizedUrl = (item.url || '').split('?')[0].replace(/\/$/, '').toLowerCase();
            if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
                seenUrls.set(normalizedUrl, item);
            }
        }
    }

    const deduped = Array.from(seenUrls.values());
    console.log(`[Dorking] Total unique results: ${deduped.length}`);
    return deduped;
}


export async function searchInternet(query) {
    try {
        const data = JSON.stringify({
            "q": query,
            "num": 20
        });

        const config = {
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: {
                'X-API-KEY': process.env.SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await axios(config);
        const results = response.data?.organic || [];

        return results.map((item, index) => ({
            id: `google-${index}`,
            title: item.title,
            snippet: item.snippet,
            link: item.link,
            thumbnail: item.imageUrl, // Serper uses imageUrl
            source: 'Google'
        }));
    } catch (error) {
        console.error('Internet search failed:', error.response?.data || error.message);
        return [];
    }
}

/**
 * Standalone helper to rank an image based on metadata
 */
export function calculateImageScore(item, targetName = "", contextKeywords = []) {
    const title = (item.title || "").toLowerCase();
    const link = (item.link || item.url || "").toLowerCase();
    const imageUrl = (item.imageUrl || "").toLowerCase();
    const targetLower = targetName.toLowerCase();

    let score = 0;

    // 1. Strict Name Match Scoring (Check title, source URL, and filename)
    if (targetName) {
        const nameParts = targetLower.split(/\s+/).filter(p => p.length > 2);
        const matches = nameParts.filter(part => {
            const regex = new RegExp(`\\b${part}\\b`, 'i');
            return regex.test(title) || link.includes(part) || imageUrl.includes(part);
        }).length;

        // Standard name scoring
        if (matches === nameParts.length && nameParts.length > 0) {
            score += 60; // Perfect name match
        } else if (matches >= 1) {
            // Adaptive name match (e.g. "Atharva" for "Atharva Auti")
            // Instead of -40 for partial, we give 20-30 and let context decide
            score += 25; 
        } else {
            score -= 50; // Total mismatch
        }

        // Contextual Fallback: If at least ONE name part matches AND context is strong, boost it
        const markers = Array.isArray(contextKeywords) ? contextKeywords : [contextKeywords];
        const contextMatches = markers.filter(keyword => {
            if (!keyword || keyword.length < 3) return false;
            return title.includes(keyword.toLowerCase()) || link.includes(keyword.toLowerCase());
        }).length;

        if (matches >= 1 && contextMatches >= 1) {
            score += 30; // Boost contextual matches for confirmed names
        }
    }

    // 2. Identity Context (Company/Profession) - CRITICAL for Bug 2
    if (contextKeywords && contextKeywords.length > 0) {
        const markers = Array.isArray(contextKeywords) ? contextKeywords : [contextKeywords];
        const contextMatches = markers.filter(keyword => {
            const kw = keyword.toLowerCase();
            return title.includes(kw) || link.includes(kw);
        }).length;

        if (contextMatches > 0) {
            score += 40; // High boost for matching company/profession markers
        }
    }

    // 3. Platform Trust & Identity Indicators
    if (link.includes("linkedin.com/in/")) score += 40;
    else if (link.includes("github.com") || link.includes("stackoverflow.com")) score += 30;
    else if (link.includes("instagram.com") || link.includes("facebook.com")) score += 20;
    else if (link.includes("twitter.com") || link.includes("x.com")) score += 20;
    else if (link.includes("t.me") || link.includes("tiktok.com") || link.includes("pinterest.com") || link.includes("youtube.com") || link.includes("reddit.com")) score += 15;

    // 4. Aspect Ratio (Profile Portrait focus)
    const width = item.imageWidth || 0;
    const height = item.imageHeight || 0;
    if (width > 0 && height > 0) {
        const ratio = width / height;
        if (ratio > 1.3) score -= 50; // Document/Landscape
        else if (ratio >= 0.7 && ratio <= 1.2) score += 20; // Portrait/Square
    }

    // 5. Junk Keywords & Document Filtering
    const junkKeywords = ["pdf", "census", "book", "cover", "stock", "generic", "everyone", "people named", "community", "banner", "logo", "screenshot"];
    const combinedLower = `${title} ${link}`.toLowerCase();
    if (junkKeywords.some(kw => combinedLower.includes(kw))) {
        score -= 80;
    }

    return score;
}

/**
 * Specialized Image Search using Serper.dev
 */
export async function searchImages(query, targetName = "", contextKeywords = []) {
    try {
        // SIMPLIFIED: Serper /images endpoint often rejects highly complex OR queries
        const data = JSON.stringify({
            "q": query,
            "num": 20
        });

        const config = {
            method: 'post',
            url: 'https://google.serper.dev/images',
            headers: {
                'X-API-KEY': process.env.SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await axios(config);
        const results = response.data?.images || [];

        // Apply scoring with context
        const scored = results.map(item => ({
            ...item,
            score: calculateImageScore(item, targetName, contextKeywords)
        }));

        // Filter and Sort by Confidence
        // SOFTENED: Lowered threshold to 5 to allow more results in for face verification to decide
        const filtered = scored
            .filter(item => item.score >= 5)
            .sort((a, b) => b.score - a.score);

        return filtered.map((item, index) => ({
            id: `image-${index}`,
            title: item.title,
            imageUrl: item.imageUrl,
            thumbnailUrl: item.thumbnailUrl,
            sourceUrl: item.link,
            source: 'Google Images',
            confidence: item.score
        }));
    } catch (error) {
        console.error('Image search failed:', error.response?.data || error.message);
        return [];
    }
}
