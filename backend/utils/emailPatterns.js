/**
 * Generates probable email patterns for a person at a domain.
 * 
 * @param {string} name - Full name (e.g. "John Smith")
 * @param {string} domain - Company domain (e.g. "google.com")
 * @returns {string[]} Array of probable emails
 */
export function generateEmailPatterns(name, domain) {
    if (!name || !domain) return [];

    const parts = name.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length < 1) return [];

    const first = parts[0];
    const last = parts[parts.length - 1] || '';
    const fi = first[0];
    const li = last ? last[0] : '';

    const patterns = [];

    // common corporate patterns
    if (last) {
        patterns.push(`${first}@${domain}`); // john@domain.com
        patterns.push(`${first}.${last}@${domain}`); // john.smith@domain.com
        patterns.push(`${fi}${last}@${domain}`); // jsmith@domain.com
        patterns.push(`${first}${li}@${domain}`); // johns@domain.com
        patterns.push(`${last}@${domain}`); // smith@domain.com
    } else {
        patterns.push(`${first}@${domain}`);
    }

    return [...new Set(patterns)]; // Deduplicate
}

export default { generateEmailPatterns };
