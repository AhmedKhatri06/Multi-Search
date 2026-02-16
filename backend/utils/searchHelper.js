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
 * Normalizes a phone number to a standard format (e.g., 91XXXXXXXXXX).
 * @param {string} phone 
 * @returns {string}
 */
export function normalizePhoneNumber(phone) {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
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
