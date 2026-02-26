/**
 * Social Profile Parser Service
 * 
 * Extracts structured metadata from Google search results for social media profiles.
 * Transforms raw search links into structured profile data with usernames, titles, and bios.
 */

/**
 * Extract LinkedIn profile data
 * @param {Object} result - Google search result object
 * @returns {Object|null} Structured LinkedIn profile or null
 */
function parseLinkedInProfile(result) {
    const url = result.url || result.link || "";
    const title = result.title || "";
    const snippet = result.snippet || result.text || "";

    // Extract username from URL
    // Examples: linkedin.com/in/mihir-doshi, linkedin.com/pub/john-doe
    const usernameMatch = url.match(/linkedin\.com\/(in|pub|profile)\/([^/?]+)/);
    const username = usernameMatch ? usernameMatch[2] : null;

    if (!username) return null;

    // Extract job title and company from title or snippet
    // Common patterns: "Name - Title at Company", "Name | Title at Company"
    let jobTitle = "";
    let company = "";

    // Try to extract from title first
    const titleParts = title.split(/[-|]/);
    if (titleParts.length > 1) {
        const jobPart = titleParts[1].trim();
        // Look for "at Company" pattern
        const atMatch = jobPart.match(/(.+?)\s+at\s+(.+)/i);
        if (atMatch) {
            jobTitle = atMatch[1].trim();
            company = atMatch[2].trim();
        } else {
            jobTitle = jobPart;
        }
    }

    // If no title found, try snippet
    if (!jobTitle && snippet) {
        const snippetMatch = snippet.match(/(.+?)\s+at\s+(.+?)[\.|,]/i);
        if (snippetMatch) {
            jobTitle = snippetMatch[1].trim();
            company = snippetMatch[2].trim();
        }
    }

    return {
        platform: "linkedin",
        username: username,
        title: jobTitle || title.split(/[-|]/)[0].trim(),
        company: company,
        bio: snippet.substring(0, 150),
        url: url
    };
}

/**
 * Extract Instagram profile data
 * @param {Object} result - Google search result object
 * @returns {Object|null} Structured Instagram profile or null
 */
function parseInstagramProfile(result) {
    const url = result.url || result.link || "";
    const title = result.title || "";
    const snippet = result.snippet || result.text || "";

    // Extract handle from URL or title
    // Examples: instagram.com/mihirdoshi, @mihirdoshi
    let handle = "";

    const urlMatch = url.match(/instagram\.com\/([^/?]+)/);
    if (urlMatch) {
        handle = urlMatch[1];
    }

    // Also check title for @handle
    const handleMatch = title.match(/@([a-zA-Z0-9._]+)/);
    if (handleMatch) {
        handle = handleMatch[1];
    }

    if (!handle) return null;

    // Extract follower count if present
    const followerMatch = snippet.match(/([\d,]+)\s+followers/i);
    const followers = followerMatch ? followerMatch[1] : null;

    // Extract bio (usually in snippet)
    let bio = snippet;
    // Remove "Instagram photos and videos" type text
    bio = bio.replace(/instagram photos and videos/gi, "").trim();

    return {
        platform: "instagram",
        username: handle,
        handle: `@${handle}`,
        followers: followers,
        bio: bio.substring(0, 150),
        url: url
    };
}

/**
 * Extract Facebook profile data
 * @param {Object} result - Google search result object
 * @returns {Object|null} Structured Facebook profile or null
 */
function parseFacebookProfile(result) {
    const url = result.url || result.link || "";
    const title = result.title || "";
    const snippet = result.snippet || result.text || "";

    // Extract page name from URL or title
    const urlMatch = url.match(/facebook\.com\/([^/?]+)/);
    const pageName = urlMatch ? urlMatch[1] : null;

    if (!pageName) return null;

    // Determine if it's a person or business page
    const isBusinessPage = snippet.toLowerCase().includes("business") ||
        snippet.toLowerCase().includes("company") ||
        title.toLowerCase().includes("business");

    return {
        platform: "facebook",
        username: pageName,
        title: title.split(/[-|]/)[0].trim(),
        pageType: isBusinessPage ? "Business" : "Personal",
        bio: snippet.substring(0, 150),
        url: url
    };
}

/**
 * Extract Twitter/X profile data
 * @param {Object} result - Google search result object
 * @returns {Object|null} Structured Twitter profile or null
 */
function parseTwitterProfile(result) {
    const url = result.url || result.link || "";
    const title = result.title || "";
    const snippet = result.snippet || result.text || "";

    // Extract handle from URL
    const urlMatch = url.match(/(?:twitter|x)\.com\/([^/?]+)/);
    const handle = urlMatch ? urlMatch[1] : null;

    if (!handle) return null;

    // Check for verified badge
    const isVerified = title.includes("✓") || snippet.includes("verified");

    return {
        platform: url.includes("x.com") ? "x" : "twitter",
        username: handle,
        handle: `@${handle}`,
        verified: isVerified,
        bio: snippet.substring(0, 150),
        url: url
    };
}

/**
 * Main parser function - routes to appropriate platform parser
 * @param {Object} result - Google search result object with link, title, snippet
 * @returns {Object|null} Structured profile data or null if not a social profile
 */
export function parseSocialProfile(result) {
    if (!result || (!result.url && !result.link)) return null;

    const url = (result.url || result.link || '').toLowerCase();

    if (url.includes("linkedin.com")) {
        return parseLinkedInProfile(result);
    }

    if (url.includes("instagram.com")) {
        return parseInstagramProfile(result);
    }

    if (url.includes("facebook.com")) {
        return parseFacebookProfile(result);
    }

    if (url.includes("twitter.com") || url.includes("x.com")) {
        return parseTwitterProfile(result);
    }

    return null; // Not a recognized social profile
}

export default {
    parseSocialProfile,
    parseLinkedInProfile,
    parseInstagramProfile,
    parseFacebookProfile,
    parseTwitterProfile
};
