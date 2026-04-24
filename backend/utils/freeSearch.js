import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

/**
 * freeSearch.js — Hybrid search engine.
 * Prioritizes Tavily AI (Free tier: 1,000 queries/month, no card needed).
 * Falls back to Google Basic (gbv=1) and DuckDuckGo Lite.
 */

const SEARXNG_INSTANCES = [
    'https://search.rhscz.eu',
    'https://searx.rhscz.eu',
    'https://searx.tiekoetter.com',
    'https://searxng.website',
    'https://search.inetol.net',
    'https://search.bladerunn.in',
    'https://search.datenkrake.ch',
    'https://search.pi.vps.pw',
    'https://searxng.site',
    'https://priv.au'
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Tavily AI Search (Zero-Cost / No Credit Card Tier)
 */
async function searchTavily(query, depth = "basic") {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
        console.warn('[FreeSearch] Tavily API key missing in .env');
        return null;
    }

    try {
        console.log(`[FreeSearch] Attempting Tavily AI (${depth}) for: "${query}"`);
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: apiKey,
            query: query,
            search_depth: depth,
            max_results: depth === "advanced" ? 20 : 15,
            include_images: depth === "advanced"
        }, { timeout: 15000 });

        if (response.data && response.data.results) {
            console.log(`[FreeSearch] Tavily AI success -> ${response.data.results.length} results`);
            const mapped = response.data.results.map(r => ({
                title: r.title,
                link: r.url,
                url: r.url,
                snippet: r.content || '',
                source: 'Tavily AI'
            }));

            if (depth === "advanced" && response.data.images) {
                return { results: mapped, images: response.data.images };
            }
            return mapped;
        }
        console.warn('[FreeSearch] Tavily AI returned no results.');
        return [];
    } catch (err) {
        console.error('[FreeSearch] Tavily AI API error:', err.response?.data || err.message);
        return null;
    }
}

/**
 * Google Basic Search (No JavaScript view)
 */
async function searchGoogleBasic(query) {
    try {
        const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}&gbv=1&num=15`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('a').each((i, el) => {
            const link = $(el).attr('href');
            if (link && link.includes('/url?q=')) {
                const cleanUrl = decodeURIComponent(link.split('/url?q=')[1].split('&')[0]);
                if (!cleanUrl.startsWith('http')) return;
                
                const title = $(el).find('div').first().text().trim() || $(el).text().trim();
                const snippet = $(el).closest('div').next().text().trim();

                if (title && cleanUrl) {
                    results.push({
                        title: title.replace(/ \d+ days ago.*/, ""),
                        link: cleanUrl,
                        url: cleanUrl,
                        snippet: snippet || "Knowledge record from Google Search",
                        source: 'Google'
                    });
                }
            }
        });

        return results.filter(r => !r.link.includes('google.com/'));
    } catch (err) {
        return [];
    }
}

/**
 * SearXNG Rotation (Best effort for specific sites)
 */
async function searchSearXNGInstance(instanceUrl, query) {
    try {
        const response = await axios.get(`${instanceUrl}/search`, {
            params: { q: query, format: 'json', language: 'en-US' },
            timeout: 4000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Accept': 'application/json'
            }
        });

        if (response.data && response.data.results) {
            return response.data.results.map(r => ({
                title: r.title,
                link: r.url,
                url: r.url,
                snippet: r.content || '',
                source: `SearXNG (${new URL(instanceUrl).hostname})`
            }));
        }
        return [];
    } catch (err) {
        return null;
    }
}

/**
 * Main Entry Point: Optimized Hybrid Search
 */
export async function searchFree(query, depth = "basic") {
    let cleanQ = query.replace(/^"+|"+$/g, '"').replace(/""+/g, '"').trim();
    if (!cleanQ) return [];

    console.log(`[FreeSearch] Request (${depth}): ${cleanQ}`);

    // 1. Primary: Tavily AI (Stable & Clean)
    const tavilyRes = await searchTavily(cleanQ, depth);
    if (tavilyRes && (Array.isArray(tavilyRes) ? tavilyRes.length > 0 : (tavilyRes.results?.length > 0))) {
        return tavilyRes;
    }

    // 2. Secondary: Google Basic (Resilient) - Depth "advanced" not supported by scraper
    const googleRes = await searchGoogleBasic(cleanQ);
    if (googleRes && googleRes.length > 0) {
        console.log(`[FreeSearch] Success via Google Basic (${googleRes.length} results)`);
        return googleRes;
    }

    // 3. Fallback: SearXNG Instance Rotation
    const shuffled = SEARXNG_INSTANCES.sort(() => 0.5 - Math.random());
    for (const instance of shuffled.slice(0, 5)) {
        const results = await searchSearXNGInstance(instance, cleanQ);
        if (results && results.length > 0) {
            console.log(`[FreeSearch] Success via: ${instance}`);
            return results;
        }
        await sleep(200);
    }

    console.warn('[FreeSearch] All engines exhausted. No results found.');
    return [];
}
