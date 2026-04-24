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
        cleanCompany ? `"${cleanName}" ${cleanCompany} email` : `"${cleanName}" email`,
        cleanCompany ? `"${cleanName}" ${cleanCompany} contact phone` : `"${cleanName}" contact phone`,
        cleanDomain ? `site:github.com "${cleanName}" ${cleanDomain}` : null,
        cleanDomain ? `"${cleanName}" ${cleanDomain} filetype:pdf` : null,
        cleanDomain ? `"${cleanName}" email ${cleanDomain}` : null,
        `"${cleanName}" phone number`
    ].filter(Boolean);

    // SANITIZE: Filter out 'null', 'undefined', or empty strings to prevent search engine penalties
    const sanitizedQueries = queries.filter(q => {
        const lower = q.toLowerCase();
        return !lower.includes('null') && !lower.includes('undefined') && 
               !lower.includes('[object object]') && !q.includes('""');
    });

    const results = [];
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // SERIALIZED EXECUTION: We run searches one-by-one to avoid rate-limiting on free engines
    for (const [idx, q] of sanitizedQueries.entries()) {
        const requestId = Math.random().toString(36).slice(-4);
        const label = `[FreeSearch-OSINT] Request: ${requestId} [${idx + 1}/${sanitizedQueries.length}]`;
        
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Timeout (15s)")), 15000)
        );

        const executeFetch = async () => {
            try {
                return await performSearch(q, true);
            } catch (err) {
                console.warn(`[FreeSearch-OSINT] Dork failed [ref:${requestId}]: ${err.message}`);
                return [];
            }
        };
        
        console.time(label);
        try {
            const r = await Promise.race([executeFetch(), timeout]);
            results.push(r || []);
            console.timeEnd(label);
        } catch (e) {
            console.warn(`[FreeSearch-OSINT] Dork timed out [ref:${requestId}]`);
            console.timeEnd(label);
            results.push([]);
        }
        
        // PACING: Breathing room between dorks
        if (idx < sanitizedQueries.length - 1) await sleep(800);
    }

    const flattened = results.flat();
    const emails = [];
    const phones = [];

    flattened.forEach(res => {
        if (!res) return; // MODULE 1: Stability check for undefined results
        const text = `${res.title || ''} ${res.snippet || ''} ${res.text || ''}`;
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
