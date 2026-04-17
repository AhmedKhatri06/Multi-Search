/**
 * Dictionaries for category-aware splitting.
 * Words in these categories are strictly treated as KEYWORDS and removed from NAME candidates.
 */
const KEYWORD_TOKENS = {
    roles: ['ceo', 'cto', 'cfo', 'md', 'phd', 'manager', 'director', 'founder', 'intern', 'engineer', 'developer', 'lead', 'associate', 'head', 'vp', 'president'],
    orgs: ['ltd', 'pvt', 'limited', 'inc', 'corp', 'solutions', 'technologies', 'infotech', 'software', 'systems', 'labs', 'startup'],
    titles: ['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'lord']
};

/**
 * Cleans raw query input by stripping special characters, extra spaces,
 * and unwanted noise words like titles or common roles.
 */
export function cleanRawQuery(raw) {
    if (!raw) return "";
    let q = raw.trim();

    // 1. Strip special symbols except basic space, hyphen, and dots
    q = q.replace(/[^a-zA-Z0-9\s\-\.]/g, " ");

    // 2. Normalize spaces
    q = q.replace(/\s+/g, " ");

    // 3. Optional: Strip leading/trailing noise that isn't part of identity
    return q.trim();
}

/**
 * Detects if the input query is likely a phone number or a name.
 * @param {string} query 
 * @returns {"PHONE" | "NAME"}
 */
export function detectInputType(query) {
    // Remove common phone formatting characters
    const cleanQuery = query.replace(/[\s\-\+\(\)]/g, "");

    // If it's pure digits and length is reasonable (e.g., > 7), it's a phone
    if (/^\d+$/.test(cleanQuery) && cleanQuery.length >= 7) {
        return "PHONE";
    }

    return "NAME";
}

/**
 * Normalizes a name for entity resolution by stripping titles, suffixes, and symbols.
 * LAYERED CLEANING: Handles labels, noise, and preserves word order.
 * @param {string} name 
 * @returns {string}
 */
export function normalizeName(name) {
    if (!name) return "";

    // 1. Convert to lowercase and trim
    let n = name.toLowerCase().trim();

    // 2. Hard-Separator Split (Colon/Semicolon)
    // "Name: John Doe" -> "John Doe"
    if (n.includes(":")) n = n.split(":")[1].trim();
    if (n.includes(";")) n = n.split(";")[1].trim();

    // 3. Noise Stripping (Punctuation/Trailing garbage)
    n = n.replace(/[!?,.\-]/g, " ").replace(/\s+/g, " ").trim();

    // 4. Handle common contextual separators 
    const separators = [" at ", " @ ", " from ", " in ", " [", " ("];
    separators.forEach(sep => {
        if (n.includes(sep)) {
            n = n.split(sep)[0].trim();
        }
    });

    // 5. Remove common titles and suffixes (e.g., Mr., Dr., CEO, Founder)
    const junkPatterns = [
        /\b(mr|mrs|ms|dr|prof|sir|lord)\.?\s+/gi,
        /\b(ceo|cto|cfo|md|phd|manager|director|founder|co-founder|student|engineer|developer|associates|lead|author|contributor)\b/gi,
        /\b(infotech|private|limited|pvt|ltd|inc|corp|corporation|group|solutions|services|technologies)\b/gi,
        /\s+\b(jr|sr|iii|iv|v)\b\.?$/gi,
        /["'()|,\-]/g // Strip quotes, parens, and separators
    ];

    junkPatterns.forEach(pattern => {
        n = n.replace(pattern, " ");
    });

    // 6. Final Clean - No word sorting (preserves 'Shah Dhruv' vs 'Dhruv Shah' preference)
    return n.replace(/\s+/g, " ").trim();
}

/**
 * Normalizes a phone number to standard E.164-ish format (+91XXXXXXXXXX).
 * Handles '00' prefix and aggressive numeric stripping while preserving leading '+'.
 * @param {string} phone 
 * @returns {string}
 */
export function normalizePhoneNumber(phone) {
    if (!phone) return "";
    
    let p = phone.trim();
    // 1. Replace starting 00 with + (international standard)
    if (p.startsWith("00")) p = "+" + p.substring(2);

    // 2. Strip all non-numeric except leading +
    const hasPlus = p.startsWith("+");
    const digits = p.replace(/\D/g, "");

    return hasPlus ? "+" + digits : digits;
}

/**
 * Intelligent Extraction: Decides what is a NAME and what are KEYWORDS.
 * CATEGORY-AWARE: Uses role/org dictionaries + word count heuristics.
 * @param {string} input 
 * @returns {{name: string, keywords: string}}
 */
export function intelligentSplit(input) {
    if (!input) return { name: "", keywords: "" };

    const cleanInput = input.replace(/\s+/g, " ").trim();
    const words = cleanInput.split(" ");
    
    // HEURISTIC 1: Detect Pivot Words ("at", "from", "@", etc.)
    const pivots = [" at ", " of ", " from ", " in ", " @ "];
    for (const pivot of pivots) {
        if (cleanInput.toLowerCase().includes(pivot)) {
            const parts = cleanInput.split(new RegExp(pivot, "i"));
            return {
                name: parts[0].trim(),
                keywords: parts.slice(1).join(" ").trim()
            };
        }
    }

    // HEURISTIC 2: Detect Field labels like ":" 
    if (cleanInput.includes(":")) {
        const parts = cleanInput.split(":");
        return {
            name: parts[0].trim(),
            keywords: parts.slice(1).join(":").trim()
        };
    }

    // HEURISTIC 3: Category-Aware Word classification
    // Walk through words. If we find a "Role" or "Org" token, everything from there is keyword.
    const nameParts = [];
    const keywordParts = [];
    let hitKeyword = false;

    for (const word of words) {
        const lower = word.toLowerCase().replace(/[^a-z]/g, "");
        const isRole = KEYWORD_TOKENS.roles.includes(lower);
        const isOrgSuffix = KEYWORD_TOKENS.orgs.includes(lower);

        if (!hitKeyword && (isRole || isOrgSuffix)) {
            hitKeyword = true;
            keywordParts.push(word);
        } else if (hitKeyword) {
            keywordParts.push(word);
        } else {
            nameParts.push(word);
        }
    }

    // HEURISTIC 4: Fallback for "Ahmed Khatri CyHEX" (where CyHEX is not in dictionary but at end)
    if (keywordParts.length === 0 && nameParts.length > 2) {
        // Names are typically first 2 words. Remaining are context.
        return {
            name: nameParts.slice(0, 2).join(" "),
            keywords: nameParts.slice(2).join(" ")
        };
    }

    return { 
        name: nameParts.join(" ").trim(), 
        keywords: keywordParts.join(" ").trim() 
    };
}

/**
 * Extracts potential phone numbers and emails from a block of text.
 * @param {string} text 
 * @returns {{phones: string[], emails: string[]}}
 */
export function extractContacts(text, targetName = '') {
    if (!text) return { phones: [], emails: [] };

    // Regex for basic international and domestic phone formats
    const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

    // Regex for standard email format
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

    const phones = (text.match(phoneRegex) || []).map(p => p.trim());
    const allEmails = (text.match(emailRegex) || []).map(e => e.trim().toLowerCase());

    // If no target name provided, return all emails (backward compatible)
    if (!targetName) {
        return {
            phones: [...new Set(phones)],
            emails: [...new Set(allEmails)]
        };
    }

    // PROXIMITY + HANDLE SIMILARITY FILTER
    const nameParts = targetName.toLowerCase().split(/\s+/).filter(p => p.length > 1);
    const firstInitial = nameParts[0]?.[0] || '';
    const lastName = nameParts[nameParts.length - 1] || '';

    const verifiedEmails = [];
    const filteredEmails = [];

    allEmails.forEach(email => {
        const prefix = email.split('@')[0].toLowerCase().replace(/[._\-0-9]/g, '');

        // Check 1: Does the email prefix contain parts of the target name?
        const prefixMatchesName = nameParts.some(part => prefix.includes(part));
        // Check 2: Does the prefix start with the first initial + last name pattern?
        const prefixMatchesInitial = prefix.startsWith(firstInitial) && prefix.includes(lastName);
        // Check 3: Does the prefix contain a DIFFERENT name entirely?
        const looksLikeDifferentPerson = prefix.length > 3 && !prefixMatchesName && !prefixMatchesInitial;

        // Check 4: Proximity — is the email near the person's name in the text?
        let isProximate = false;
        const emailIndex = text.toLowerCase().indexOf(email);
        if (emailIndex >= 0) {
            const surroundingText = text.substring(
                Math.max(0, emailIndex - 200),
                Math.min(text.length, emailIndex + 200)
            ).toLowerCase();
            isProximate = nameParts.some(p => surroundingText.includes(p));
        }

        if (prefixMatchesName || prefixMatchesInitial) {
            verifiedEmails.push(email);
        } else if (isProximate && !looksLikeDifferentPerson) {
            verifiedEmails.push(email);
        } else {
            console.log(`[Contact Filter] Rejected email "${email}" for target "${targetName}" (prefix: "${prefix}", proximate: ${isProximate})`);
            filteredEmails.push(email);
        }
    });

    return {
        phones: [...new Set(phones)],
        emails: [...new Set(verifiedEmails)],
        filteredEmails: [...new Set(filteredEmails)]
    };
}

/**
 * Maps varying source data to a unified profile structure.
 * @param {any} item Raw data item from any source
 * @param {string} source Source identifier (e.g., "CSV:True.csv", "SQLite", "MongoDB")
 * @returns {any} Unified profile object
 */
export function unifiedMapper(item, source) {
    const phoneNumbers = new Set();

    // Extract phone numbers from various common fields
    const phoneFields = ['Number', 'phone', 'mobile', 'contact', 'telephone', 'phone_number'];
    phoneFields.forEach(field => {
        if (item[field]) {
            const normalized = normalizePhoneNumber(String(item[field]));
            if (normalized) phoneNumbers.add(normalized);
        }
    });

    // Handle nested or array phone numbers if they exist
    if (Array.isArray(item.phoneNumbers)) {
        item.phoneNumbers.forEach(p => {
            const normalized = normalizePhoneNumber(String(p));
            if (normalized) phoneNumbers.add(normalized);
        });
    }

    return {
        name: item.Name || item.name || item.full_name || "Unknown",
        phoneNumbers: Array.from(phoneNumbers),
        location: item.Address || item.location || item.address || "",
        description: item.JobTitle || item.description || item.bio || "",
        company: item.CompanyName || item.company || item.organization || "",
        email: item.Email || item.email || "",
        image: item.Image || item.image || item.profile_pic || "",
        source: source || item.source || "Unknown",
        raw: item // Keep raw data just in case
    };
}
