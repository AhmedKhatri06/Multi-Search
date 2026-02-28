import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

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

    // 1. Name Match Scoring (Check title, source URL, and filename)
    if (targetName) {
        const nameParts = targetLower.split(' ').filter(p => p.length > 2);
        const matches = nameParts.filter(part => {
            return title.includes(part) || link.includes(part) || imageUrl.includes(part);
        }).length;
        score += (matches / nameParts.length) * 50;
    }

    // 2. Context-Aware Scoring (CRITICAL for resolving Name Collisions)
    if (contextKeywords && contextKeywords.length > 0) {
        const contextMatches = contextKeywords.filter(keyword => {
            const kw = keyword.toLowerCase();
            return title.includes(kw) || link.includes(kw);
        }).length;

        if (contextMatches > 0) {
            score += 25; // Significant boost for context match
        }
    }

    // 3. Platform Trust Scoring
    if (link.includes("linkedin.com")) score += 30;
    else if (link.includes("crunchbase.com") || link.includes("forbes.com") || link.includes("bloomberg.com")) score += 20;
    else if (link.includes("twitter.com") || link.includes("facebook.com")) score += 15;

    // 4. Aspect Ratio Filter
    const width = item.imageWidth || 0;
    const height = item.imageHeight || 0;
    let ratioScore = 0;
    if (width > 0 && height > 0) {
        const ratio = width / height;
        if (ratio > 1.4) ratioScore = -60; // Landscape/Banner
        else if (ratio < 0.5) ratioScore = -40; // Too narrow
        else if (ratio >= 0.7 && ratio <= 1.2) ratioScore = 25;
    }
    score += ratioScore;

    // 5. Junk Keywords Negative Score
    const junkKeywords = [
        "profiles", "members", "team", "group", "directory", "staff", "faculty", "associates", "class of",
        "stock photo", "generic", "everyone", "people named", "community", "banner", "logo", "icon",
        "placeholder", "avatar", "default", "screenshot", "presentation", "slide", "event", "summit", "conference"
    ];

    const combinedLower = `${title} ${link} ${imageUrl}`.toLowerCase();
    if (junkKeywords.some(kw => combinedLower.includes(kw))) {
        score -= 50;
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
        // SOFTENED: Lowered threshold to 10 to allow more results in while still filtering junk
        const filtered = scored
            .filter(item => item.score >= 10)
            .sort((a, b) => b.score - a.score);

        // FALLBACK: If we filtered too aggressively, take the top 3 even if score is lower
        if (filtered.length === 0 && results.length > 0) {
            console.log(`[Image Discovery] Scoring was too strict, taking top raw results for: ${targetName}`);
            return results.slice(0, 5).map((item, index) => ({
                id: `image-fb-${index}`,
                title: item.title,
                imageUrl: item.imageUrl,
                thumbnailUrl: item.thumbnailUrl,
                sourceUrl: item.link,
                source: 'Google Images (Strictness Fallback)',
                confidence: 10
            }));
        }

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
