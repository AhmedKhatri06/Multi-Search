// Social Media Discovery Service
const platformPriority = {
    'linkedin': 1,
    'github': 2,
    'twitter': 3,
    'x': 3,
    'instagram': 4,
    'facebook': 5,
    'crunchbase': 6,
    'medium': 7,
    'stackoverflow': 8,
    'behance': 9,
    'dribbble': 10,
    'linktree': 11,
    'aboutme': 12
};

const profilePatterns = {
    // Exact profile matches or with query params
    instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?(\?.*)?$/,
    // LinkedIn profiles - support regional subdomains (in.linkedin.com, uk.linkedin.com)
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?(\?.*)?$/,
    github: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/,
    // Twitter/X profiles
    twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?(\?.*)?$/,
    // Facebook profiles/pages (support query params)
    facebook: /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?(\?.*)?$/,
    crunchbase: /^https?:\/\/(www\.)?crunchbase\.com\/person\/[a-zA-Z0-9_-]+\/?$/,
    medium: /^https?:\/\/(www\.)?medium\.com\/@?[a-zA-Z0-9._-]+\/?$/,
    stackoverflow: /^https?:\/\/stackoverflow\.com\/users\/\d+\/[a-zA-Z0-9._-]+\/?$/,
    behance: /^https?:\/\/(www\.)?behance\.net\/[a-zA-Z0-9._-]+\/?$/,
    dribbble: /^https?:\/\/(www\.)?dribbble\.com\/[a-zA-Z0-9._-]+\/?$/,
    linktree: /^https?:\/\/(www\.)?linktr\.ee\/[a-zA-Z0-9._-]+\/?$/,
    aboutme: /^https?:\/\/(www\.)?about\.me\/[a-zA-Z0-9._-]+\/?$/
};

const disqualifyingPatterns = [
    'view profile of people named', 'search results',
    '/p/', '/posts/', '/status/', '/photos/', '/videos/', '/reel/', '/stories/',
    '/groups/', '/marketplace/', '/watch/', '/search/', '/events/'
];

// Heuristic noise patterns ubiquitous in social snippets
const socialNoisePatterns = [
    'see photos and videos', 'followers', 'following', 'posts', 'photo by', 'video by',
    'instagram photos and videos', 'on instagram', 'check out', 'shared a', 'reposted',
    'mentioned you', 'tagged', 'commented', 'liked'
];

/**
 * Heuristic Cleaning: Strips platform-specific UI boilerplate from snippets
 * before analysis. This prevents accidental rejection of valid social profiles.
 */
function cleanSnippet(text) {
    let cleaned = text.toLowerCase();
    socialNoisePatterns.forEach(pattern => {
        cleaned = cleaned.replace(new RegExp(pattern, 'gi'), '');
    });
    return cleaned.trim();
}

function calculateIdentityScore(result, personName, options = {}) {
    const { keywords = [], location = '', targetEmails = [], targetPhones = [], knownHandle = '', platform = '' } = options;

    let score = 0;
    const title = (result.title || '').toLowerCase();
    const rawSnippet = (result.snippet || result.text || '').toLowerCase();
    const link = (result.url || result.link || '').toLowerCase();

    // 0. Heuristic Cleanup
    const cleanedSnippet = cleanSnippet(rawSnippet);
    const combinedText = `${title} ${cleanedSnippet}`.toLowerCase();

    // ID ANCHORING: If we find a known email or phone, it's a guaranteed match (+100)
    const hasEmailMatch = targetEmails.some(email =>
        combinedText.includes(email.toLowerCase()) || link.includes(email.toLowerCase())
    );
    const hasPhoneMatch = targetPhones.some(phone => {
        const clean = phone.replace(/\D/g, '');
        return clean.length > 5 && (combinedText.includes(clean) || link.includes(clean));
    });

    if (hasEmailMatch || hasPhoneMatch) {
        return 100;
    }

    // HANDLE CORRELATION: Massive boost (+40) if handle matches a known verified identity
    if (knownHandle && link.toLowerCase().includes(knownHandle.toLowerCase())) {
        console.log(`    [Handle Pivot] MATCH: ${knownHandle} -> ${link}`);
        score += 40;
    }

    // 1. Adaptive Name Matching (0-40 points)
    const nameParts = personName.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    if (nameParts.length < 1) return 0;

    let nameMatches = 0;
    nameParts.forEach(part => {
        if (title.includes(part) || link.includes(part)) nameMatches++;
    });

    // REJECTION LOGIC: 
    // - Professional sites (LinkedIn/Crunchbase) REQUIRE at least 2 name parts or handle match.
    // - Social sites (IG/X) allow 1 name part if it's a specific match or handle exists.
    const isProfessional = ['linkedin', 'crunchbase'].includes(platform);
    if (isProfessional && nameMatches < 2 && !knownHandle) return 0;
    if (!isProfessional && nameMatches < 1) return 0;

    score += (nameMatches / nameParts.length) * 40;

    // 2. Company/Identity Core Match (0-50 points)
    if (keywords && keywords.length > 0) {
        let keywordMatches = 0;
        const kwList = Array.isArray(keywords) ? keywords : [keywords];

        kwList.forEach(kw => {
            const lowerKw = kw.toLowerCase().trim();
            if (combinedText.includes(lowerKw)) keywordMatches += 2;
        });

        score += Math.min(keywordMatches * 25, 50);
    }

    // 3. Location Matching (0-10 points)
    if (location && (combinedText.includes(location.toLowerCase()) || link.includes(location.toLowerCase()))) {
        score += 10;
    }

    // 4. Penalty System (instead of hard disqualification for some terms)
    // Low-weight markers that imply it MIGHT be a post rather than a profile
    const softDisqualifiers = ['posted', 'shared', 'mentioned', 'reposted', 'tweeted'];
    softDisqualifiers.forEach(term => {
        if (rawSnippet.toLowerCase().includes(term)) score -= 15;
    });

    // 5. Business Page Penalty
    const businessPatterns = ["global", "solutions", "team", "services", "corporate", "agency", "consulting"];
    const isLikelyBusiness = businessPatterns.some(p => link.includes(p) || title.includes(p));
    const titleIsPersonal = title.includes(personName.toLowerCase());

    if (isLikelyBusiness && !titleIsPersonal && !combinedText.includes("founder") && !combinedText.includes("ceo")) {
        score -= 60;
    }

    return Math.max(0, Math.round(score));
}

function containsDisqualifyingPattern(result) {
    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || result.text || '').toLowerCase();
    const link = (result.url || result.link || '').toLowerCase();
    const combinedText = `${title} ${snippet} ${link}`;

    return disqualifyingPatterns.find(pattern => combinedText.includes(pattern));
}

function isValidProfileUrl(url, platform) {
    const pattern = profilePatterns[platform];
    if (!pattern) return false;
    return pattern.test(url);
}

export function extractSocialAccounts(internetResults, personName, keywords = [], location = '', targetEmails = [], targetPhones = [], options = {}) {
    const socialAccounts = [];
    const seenUrls = new Set();

    console.log(`[Social Discovery] Analyzing ${internetResults.length} results for: ${personName}`);
    if (targetEmails.length > 0) console.log(`  Anchors: ${targetEmails.join(', ')}`);

    internetResults.forEach(result => {
        const link = result.url || result.link || '';
        if (!link) return;

        // Detect platform
        let platform = null;
        if (link.includes('linkedin.com')) platform = 'linkedin';
        else if (link.includes('github.com')) platform = 'github';
        else if (link.includes('twitter.com') || link.includes('x.com')) platform = 'twitter';
        else if (link.includes('instagram.com')) platform = 'instagram';
        else if (link.includes('facebook.com')) platform = 'facebook';
        else if (link.includes('crunchbase.com/person/')) platform = 'crunchbase';
        else if (link.includes('medium.com')) platform = 'medium';
        else if (link.includes('stackoverflow.com/users/')) platform = 'stackoverflow';
        else if (link.includes('behance.net')) platform = 'behance';
        else if (link.includes('dribbble.com')) platform = 'dribbble';
        else if (link.includes('linktr.ee')) platform = 'linktree';
        else if (link.includes('about.me')) platform = 'aboutme';

        if (!platform) return;

        // Validate profile URL
        if (!isValidProfileUrl(link, platform)) {
            console.log(`  [Skip] ${platform}: URL pattern mismatch -> ${link}`);
            return;
        }

        // Check for disqualifying patterns
        const disqualifier = containsDisqualifyingPattern(result);
        if (disqualifier) {
            console.log(`  [Skip] ${platform}: Found disqualifier "${disqualifier}" -> ${link}`);
            return;
        }

        // Calculate identity score with anchoring and handle pivot support
        const identityScore = calculateIdentityScore(result, personName, {
            keywords,
            location,
            targetEmails,
            targetPhones,
            knownHandle: options.knownHandle || '',
            platform
        });

        // Reject low confidence matches
        if (identityScore < 10) {
            console.log(`  [Skip] ${platform}: Score too low (${identityScore}) -> ${link}`);
            return;
        }

        // Avoid duplicates
        if (seenUrls.has(link.split('?')[0].replace(/\/$/, ''))) return;
        seenUrls.add(link.split('?')[0].replace(/\/$/, ''));

        // Extract username
        let username = link.split('?')[0].split('/').filter(Boolean).pop();
        if (platform === 'linkedin' && (username === 'in' || username === 'pub')) {
            username = link.split('?')[0].split('/').filter(Boolean).slice(-2, -1)[0] || username;
        }

        console.log(`  [Found] ${platform}: ${username} [Score: ${identityScore}]`);

        socialAccounts.push({
            platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            username,
            url: link,
            confidence: identityScore >= 65 ? 'high' : identityScore >= 45 ? 'medium' : 'low',
            identityScore,
            priority: platformPriority[platform] || 99
        });
    });

    // Sort by identity score (desc) then platform priority (asc)
    socialAccounts.sort((a, b) => {
        if (b.identityScore !== a.identityScore) {
            return b.identityScore - a.identityScore;
        }
        return a.priority - b.priority;
    });

    // Per-Platform Deduplication: Keep only the best match per platform
    const platformToBestAccount = new Map();
    socialAccounts.forEach(acc => {
        const platformKey = acc.platform.toLowerCase();
        if (!platformToBestAccount.has(platformKey)) {
            platformToBestAccount.set(platformKey, acc);
        }
    });

    const dedupedAccounts = Array.from(platformToBestAccount.values());

    console.log(`[Social Discovery] Final count (deduped): ${dedupedAccounts.length}`);
    return dedupedAccounts;
}

export { calculateIdentityScore };
