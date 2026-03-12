/**
 * Google Dorking Service
 * 
 * Generates advanced Google search queries using operators like site:, intitle:,
 * inurl:, filetype:, etc. to discover a person's digital footprint across
 * multiple platforms efficiently.
 * 
 * Uses "Query Packing" (combining multiple site: operators with OR) to minimize
 * API credit usage while maximizing discovery breadth.
 */

/**
 * Tier 1: High-yield social & professional discovery.
 * decoupled into three specific groupings to match platform behavior.
 * 
 * @param {string} name - Full name of the person
 * @param {string} keywords - Optional company/profession/keyword context
 * @param {string} location - Optional location context
 * @returns {string[]} Array of packed dork query strings
 */
export function generateTier1Dorks(name, keywords = '', location = '') {
    const quotedName = `"${name}"`;
    const context = [keywords, location].filter(Boolean).join(' ');
    const dorks = [];

    // --- 1. Professional Tier (Context Heavy) ---
    // Targets sites where professional context helps disambiguation
    const professionalSites = [
        'site:linkedin.com/in/',
        'site:crunchbase.com/person/',
        'site:github.com'
    ].join(' OR ');
    dorks.push(`${quotedName} ${context} (${professionalSites})`.trim());

    // --- 2. Identity Tier (Context Light) ---
    // Social sites where people often don't list professional details in Bios.
    // Use ONLY Name to ensure we don't accidentally filter out profiles.
    const socialSites = [
        'site:instagram.com',
        'site:twitter.com',
        'site:x.com',
        'site:facebook.com'
    ].join(' OR ');
    dorks.push(`${quotedName} (${socialSites})`.trim());

    // --- 3. Aggregator Tier (Hub Discovery) ---
    const hubSites = [
        'site:linktr.ee',
        'site:bio.link',
        'site:about.me'
    ].join(' OR ');
    dorks.push(`${quotedName} (${hubSites})`.trim());

    return dorks;
}

/**
 * Tier 2: Deep discovery for professional and creative footprints.
 * Executed on-demand when Tier 1 results are insufficient or when the
 * user explicitly requests expanded search.
 * 
 * @param {string} name - Full name of the person
 * @param {string} keywords - Optional company/profession/keyword context
 * @param {string} location - Optional location context
 * @returns {string[]} Array of packed dork query strings
 */
export function generateTier2Dorks(name, keywords = '', location = '') {
    const quotedName = `"${name}"`;
    const context = [keywords, location].filter(Boolean).join(' ');
    const dorks = [];

    // --- Packed Query 1: Creative & Developer Platforms ---
    const creativeSites = [
        'site:behance.net',
        'site:dribbble.com',
        'site:stackoverflow.com/users/',
        'site:medium.com'
    ].join(' OR ');
    dorks.push(`${quotedName} ${context} (${creativeSites})`.trim());

    // --- Query 2: Personal Branding & Websites ---
    dorks.push(`${quotedName} (intitle:"portfolio" OR intitle:"blog" OR "personal website") ${context}`.trim());

    // --- Query 3: Documents & Resumes ---
    dorks.push(`${quotedName} ${context} (intitle:resume OR intitle:cv) filetype:pdf`.trim());

    return dorks;
}

/**
 * Generate all dork queries for a given person, organized by tier.
 * 
 * @param {Object} params
 * @param {string} params.name - Full name of the person
 * @param {string} [params.keywords] - Company, profession, or keyword
 * @param {string} [params.location] - Location/city
 * @returns {{ tier1: string[], tier2: string[] }}
 */
export function generateDorks({ name, keywords = '', location = '' }) {
    if (!name) return { tier1: [], tier2: [] };

    return {
        tier1: generateTier1Dorks(name, keywords, location),
        tier2: generateTier2Dorks(name, keywords, location)
    };
}

/**
 * Filter and deduplicate results from multiple dork queries.
 * Ensures the same URL is not returned from different queries.
 * 
 * @param {Array[]} resultSets - Array of result arrays from different dork queries
 * @returns {Object[]} Deduplicated and merged results
 */
export function deduplicateDorkResults(resultSets) {
    const seenUrls = new Map();

    for (const results of resultSets) {
        for (const item of results) {
            const url = (item.url || item.link || '').split('?')[0].replace(/\/$/, '').toLowerCase();
            if (!url) continue;

            if (!seenUrls.has(url)) {
                seenUrls.set(url, item);
            }
        }
    }

    return Array.from(seenUrls.values());
}

/**
 * Generates dorks specifically for finding external documents (PDF, DOCX, etc.)
 * @param {Object} params - person attributes
 * @returns {Array} List of document dorks
 */
export const generateDocumentDorks = (params) => {
    const { name, location, keywords } = params;
    const cleanName = name.replace(/"/g, '');
    const context = `${keywords || ''} ${location || ''}`.trim();

    return [
        `"${cleanName}" filetype:pdf (resume OR cv OR bio OR profiling)`,
        `"${cleanName}" ${context} filetype:pdf`,
        `site:linkedin.com/in/ "${cleanName}" filetype:pdf`,
        `"${cleanName}" filetype:docx OR filetype:doc`,
        `"${cleanName}" ${context} filetype:ppt OR filetype:pptx`
    ];
};

/**
 * Generate "Pivot" dork queries based on a discovered username/handle.
 * Used to find the same individual across multiple platforms once a primary handle is known.
 * 
 * @param {string} name - Full name of the person
 * @param {string} handle - Discovered username/handle
 * @returns {string[]} Array of packed pivot dork query strings
 */
export function generatePivotDorks(name, handle) {
    if (!handle || handle.length < 3) return [];

    const quotedName = `"${name}"`;
    const inurlHandle = `inurl:${handle}`;

    // Search sites for the same handle/slug in the URL
    const targetSites = [
        'site:instagram.com',
        'site:twitter.com',
        'site:x.com',
        'site:facebook.com',
        'site:github.com',
        'site:behance.net',
        'site:dribbble.com',
        'site:medium.com'
    ].join(' OR ');

    return [`${quotedName} (${targetSites}) ${inurlHandle}`.trim()];
}

export default {
    generateDorks,
    generateTier1Dorks,
    generateTier2Dorks,
    generatePivotDorks,
    deduplicateDorkResults
};
