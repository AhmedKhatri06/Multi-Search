import { performSearch } from '../routes/multiSearch.js';
import { extractEmails, extractPhones } from './contactService.js';

/**
 * Helper: Scrub internal database diagnostic markers from search strings.
 */
function scrubInternalMarkers(str = "") {
    if (!str) return "";
    return str
        .replace(/Record found in Cluster DB/gi, "")
        .replace(/Cluster Match:/gi, "")
        .replace(/["']/g, "") // Strip all internal quotes to prevent nested syntax error
        .trim();
}

/**
 * Searches public sources for emails related to a name and company.
 */
export async function searchPublicSignals(name, company, domain) {
    const cleanName = name.replace(/"/g, "").trim();
    const cleanCompany = scrubInternalMarkers(company);
    const cleanDomain = scrubInternalMarkers(domain);

    const queries = [
        `"${cleanName}" ${cleanCompany} email`,
        `"${cleanName}" ${cleanCompany} contact phone`,
        `site:github.com "${cleanName}" ${cleanDomain}`,
        `"${cleanName}" ${cleanDomain} filetype:pdf`,
        `"${cleanName}" email ${cleanDomain}`,
        `"${cleanName}" phone number`
    ];

    // SANITIZE: Filter out 'null', 'undefined', or empty strings to prevent Serper 400 errors
    const sanitizedQueries = queries.filter(q => {
        const lower = q.toLowerCase();
        // AGGRESSIVE: Catch both "null" and null identifier being cast to string
        return !lower.includes(' null') && !lower.includes('null ') && !lower.includes('"null"') &&
               !lower.includes('undefined') && !lower.includes('[object object]') && 
               !q.includes('""');
    });

    const results = await Promise.all(
        sanitizedQueries.map((q, idx) => {
            const requestId = Math.random().toString(36).slice(-4);
            const label = `[Serper] Simple Request: ${requestId} [${idx}]`;
            console.time(label);
            
            // AGGRESSIVE: Cap each dork at 20s to prevent hanging
            const timeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Serper timeout (20s)")), 20000)
            );
            
            return Promise.race([performSearch(q, true), timeout])
                .then(r => {
                    console.timeEnd(label);
                    return r;
                })
                .catch((e) => {
                    console.warn(`[Serper] Dork failed or timed out: ${e.message} [ref:${requestId}]`);
                    console.timeEnd(label);
                    return [];
                });
        })
    );

    const flattened = results.flat();
    const emails = [];
    const phones = [];

    flattened.forEach(res => {
        const text = `${res.title || ''} ${res.snippet || ''}`;
        const extractedEmails = extractEmails(text);
        const extractedPhones = extractPhones(text);
        emails.push(...extractedEmails);
        phones.push(...extractedPhones);
    });

    // SORT & DEDUPE: Prioritize domain-matching emails, but KEEP others (Personal/Gmails)
    const uniqueEmails = [...new Set(emails)];
    const sortedEmails = uniqueEmails.sort((a, b) => {
        const aMatches = domain && a.toLowerCase().includes(domain.toLowerCase()) ? 1 : 0;
        const bMatches = domain && b.toLowerCase().includes(domain.toLowerCase()) ? 1 : 0;
        return bMatches - aMatches;
    });
    
    return {
        emails: sortedEmails,
        phones: [...new Set(phones)]
    };
}

export default { searchPublicSignals };
