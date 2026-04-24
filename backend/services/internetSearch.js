import axios from 'axios';
import dotenv from 'dotenv';
import { searchFree } from '../utils/freeSearch.js';

dotenv.config();

/**
 * Execute multiple dork queries via Free Engine and aggregate unique results.
 * Each dork is a separate API call; results are merged and deduplicated by URL.
 * 
 * @param {string[]} dorks - Array of Google Dork query strings
 * @param {number} [numPerQuery=10] - Number of results per query
 * @returns {Object[]} Deduplicated search results
 */
export async function searchWithDorks(dorks, numPerQuery = 10) {
    if (!dorks || dorks.length === 0) return [];

    console.log(`[Dorking] Executing ${dorks.length} dorks using Primary Free Engine...`);
    
    // We run dorks sequentially in free mode to avoid instance rate-limiting
    const results = [];
    for (const dork of dorks) {
        const res = await searchFree(dork);
        results.push(...res);
    }

    // Map to the unified structure
    const mapped = results.map((item, i) => ({
        id: `dork-free-${i}`,
        title: item.title || 'Untitled',
        text: item.snippet || '',
        snippet: item.snippet || '',
        url: item.link || '',
        link: item.link || '',
        source: 'Internet',
        provider: item.source || 'Free Search',
        type: 'AUX',
        priority: 3,
        images: item.imageUrl ? [item.imageUrl] : [],
        dorkQuery: item.dorkQuery
    }));

    // Deduplicate by URL
    const seenUrls = new Set();
    const deduped = mapped.filter(item => {
        const normalizedUrl = (item.url || '').split('?')[0].replace(/\/$/, '').toLowerCase();
        if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            return true;
        }
        return false;
    });

    console.log(`[Dorking] Total unique results: ${deduped.length}`);
    return deduped;
}


export async function searchInternet(query) {
    try {
        console.log(`[Search] Using Primary Free Engine for internet search: "${query}"`);
        const results = await searchFree(query);

        return results.map((item, index) => ({
            id: `google-free-${index}`,
            title: item.title,
            snippet: item.snippet,
            link: item.link,
            thumbnail: item.url, // Standard link as thumbnail fallback
            source: item.source || 'Search'
        }));
    } catch (error) {
        console.error('Internet search failed:', error.message);
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
 * Specialized Image Search using Free Engine
 */
export async function searchImages(query, targetName = "", contextKeywords = []) {
    try {
        console.log(`[Search] Using Primary Free Engine for image search: "${query}"`);
        const results = await searchFree(query);

        return results.map((item, index) => ({
            id: `free-image-${index}`,
            title: item.title,
            imageUrl: item.link, 
            thumbnailUrl: item.link,
            sourceUrl: item.link,
            source: item.source || 'Free Search',
            confidence: 5 // Low confidence for non-image specialized results
        }));
    } catch (error) {
        console.error('Image search failed:', error.message);
        return [];
    }
}
