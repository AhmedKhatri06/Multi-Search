import { performSearch } from '../routes/multiSearch.js';
import { extractEmails } from './contactService.js';

/**
 * Searches public sources for emails related to a name and company.
 * 
 * @param {string} name 
 * @param {string} company 
 * @param {string} domain 
 * @returns {Promise<string[]>} List of discovered emails
 */
export async function searchPublicSignals(name, company, domain) {
    const queries = [
        `"${name}" "${company}" email`,
        `site:github.com "${name}" "${domain}"`,
        `"${name}" ${domain} filetype:pdf`,
        `"${name}" email "${domain}"`
    ];

    const results = await Promise.all(
        queries.map(q => performSearch(q, true).catch(() => []))
    );

    const flattened = results.flat();
    const emails = [];

    flattened.forEach(res => {
        const text = `${res.title || ''} ${res.snippet || ''}`;
        const extracted = extractEmails(text);
        emails.push(...extracted);
    });

    // Filter by domain if possible
    const relevantEmails = emails.filter(e => e.toLowerCase().includes(domain.toLowerCase()));
    
    return [...new Set(relevantEmails)];
}

export default { searchPublicSignals };
