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
 * @param {string} name 
 * @returns {string}
 */
export function normalizeName(name) {
    if (!name) return "";

    // 1. Convert to lowercase and trim
    let n = name.toLowerCase().trim();

    // 2. Handle common separators - if there's a dash, pipe, or comma, 
    // the name is usually BEFORE the separator.
    const separators = [" - ", " | ", " , ", " at ", " @ "];
    separators.forEach(sep => {
        if (n.includes(sep)) {
            n = n.split(sep)[0].trim();
        }
    });

    // 3. Remove common titles and suffixes (e.g., Mr., Dr., CEO, Founder)
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

    // 4. Compact whitespace and sort words 
    return n.split(/\s+/).filter(word => word.length > 1).sort().join(" ").trim();
}

/**
 * Normalizes a phone number to a standard format (e.g., 91XXXXXXXXXX).
 * @param {string} phone 
 * @returns {string}
 */
export function normalizePhoneNumber(phone) {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
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
