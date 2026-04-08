// Social Media Discovery Service
const platformPriority = {
    'wikipedia': 0, // Knowledge sources always win
    'linkedin': 1,  // PRIMARY IDENTITY SOURCE (Elevated from 2 to 1)
    'imdb': 2,
    'github': 3,
    'twitter': 3,
    'x': 3,
    'instagram': 4,
    'facebook': 5,
    'telegram': 6,
    'tiktok': 7,
    'pinterest': 8,
    'youtube': 9,
    'snapchat': 10,
    'reddit': 11,
    'crunchbase': 12,
    'medium': 13,
    'stackoverflow': 14,
    'behance': 15,
    'dribbble': 16,
    'linktree': 17,
    'aboutme': 18,
    'bumble': 19
};

const profilePatterns = {
    // Exact profile matches or with query params
    instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?(\?.*)?$/,
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?(\?.*)?$/,
    github: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/,
    twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?(\?.*)?$/,
    facebook: /^https?:\/\/(www\.)?facebook\.com\/(?!(policies|legal|help|groups|events|marketplace|watch|photo\.php|story\.php))[a-zA-Z0-9._-]+\/?(\?.*)?$/,
    telegram: /^https?:\/\/t\.me\/[a-zA-Z0-9_]{5,}\/?$/,
    tiktok: /^https?:\/\/(www\.)?tiktok\.com\/@[a-zA-Z0-9._-]+\/?$/,
    pinterest: /^https?:\/\/(www\.)?pinterest\.(com|cl|co|ca|de|es|fr|it|jp|ru)\/[a-zA-Z0-9._-]+\/?$/,
    youtube: /^https?:\/\/(www\.)?youtube\.com\/(c\/|user\/|@)[a-zA-Z0-9._-]+\/?$/,
    snapchat: /^https?:\/\/(www\.)?snapchat\.com\/add\/[a-zA-Z0-9._-]+\/?$/,
    reddit: /^https?:\/\/(www\.)?reddit\.com\/user\/[a-zA-Z0-9._-]+\/?$/,
    crunchbase: /^https?:\/\/(www\.)?crunchbase\.com\/person\/[a-zA-Z0-9_-]+\/?$/,
    medium: /^https?:\/\/(www\.)?medium\.com\/@?[a-zA-Z0-9._-]+\/?$/,
    stackoverflow: /^https?:\/\/stackoverflow\.com\/users\/\d+\/[a-zA-Z0-9._-]+\/?$/,
    stackoverflow: /^https?:\/\/stackoverflow.com\/users\/\d+\/[a-zA-Z0-9._-]+\/?$/,
    behance: /^https?:\/\/(www\.)?behance\.net\/[a-zA-Z0-9._-]+\/?$/,
    dribbble: /^https?:\/\/(www\.)?dribbble\.com\/[a-zA-Z0-9._-]+\/?$/,
    linktree: /^https?:\/\/(www\.)?linktr\.ee\/[a-zA-Z0-9._-]+\/?$/,
    aboutme: /^https?:\/\/(www\.)?about\.me\/[a-zA-Z0-9._-]+\/?$/,
    bumble: /^https?:\/\/(www\.)?bumble\.com\/[a-zA-Z0-9._-]+\/?$/
};

const disqualifyingPatterns = [
    'view profile of people named', 'search results',
    '/p/', '/posts/', '/status/', '/photos/', '/videos/', '/reel/', '/stories/',
    '/groups/', '/marketplace/', '/watch/', '/search/', '/events/',
    '/pin/', '/clip/', '/watch?v=', '/shorts/', '/channel/'
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

    // 1. Adaptive Name Match Scoring (0-40 points)
    const nameParts = personName.toLowerCase().split(/\s+/).filter(p => p.length > 2);
    if (nameParts.length < 1) return 0;

    const firstName = nameParts[0];
    const surname = nameParts.length > 1 ? nameParts[nameParts.length - 1] : null;

    let firstNameMatched = title.includes(firstName) || link.includes(firstName);
    let surnameMatched = surname ? (title.includes(surname) || link.includes(surname)) : true;

    // CRITICAL: Full-text scan if simple header check fails
    if (!firstNameMatched || !surnameMatched) {
        if (!firstNameMatched && combinedText.includes(firstName)) firstNameMatched = true;
        if (!surnameMatched && surname && combinedText.includes(surname)) surnameMatched = true;
    }

    // SURNAME ENFORCEMENT: If they have a surname, it MUST match for common sources.
    if (surname && !surnameMatched && !knownHandle) {
        console.log(`    [Identity Reject] Surname mismatch for ${platform}: ${link}`);
        return 0; 
    }

    // WIKIPEDIA ANCHORING: Strict Title/URL requirement for Wikipedia to avoid collision (e.g. Desai vs Doshi)
    if (platform === 'wikipedia' && surname) {
        const titleAnchor = title.includes(surname);
        const urlAnchor = link.includes(surname);
        if (!titleAnchor && !urlAnchor && !knownHandle) {
            console.log(`    [Identity Reject] Wikipedia Anchor failure (Surname not in Title/URL): ${link}`);
            return 0;
        }
    }

    let nameMatches = 0;
    nameParts.forEach(part => {
        if (combinedText.includes(part) || link.includes(part)) nameMatches++;
    });

    const nameMatchRatio = nameMatches / nameParts.length;
    score += nameMatchRatio * 40;

    // 2. Company/Identity Core Match (0-50 points)
    let hasKeywordMatch = false;
    if (keywords && keywords.length > 0) {
        let keywordMatches = 0;
        const kwList = Array.isArray(keywords) ? keywords : [keywords];

        kwList.forEach(kw => {
            const lowerKw = kw.toLowerCase().trim();
            if (lowerKw && combinedText.includes(lowerKw)) keywordMatches += 2;
        });

        if (keywordMatches > 0) hasKeywordMatch = true;
        score += Math.min(keywordMatches * 25, 50);
    }

    // 3. Location Matching (0-10 points)
    if (location && (combinedText.includes(location.toLowerCase()) || link.includes(location.toLowerCase()))) {
        score += 10;
    }

    // 4. NAME COLLISION PENALTY (Critical for common names)
    // If we have keywords/context but NONE match the candidate, this is likely a different person
    if (keywords && keywords.length > 0 && !hasKeywordMatch && !knownHandle) {
        // Check if the snippet contains a DIFFERENT person's identity markers
        const nameLower = personName.toLowerCase();
        const firstNamePart = nameParts[0] || '';

        // If the snippet/bio mentions a different first name alongside same last name = collision
        const differentFirstNames = ['founder', 'ceo', 'director', 'manager', 'engineer'];
        const hasProfessionalTitle = differentFirstNames.some(t => combinedText.includes(t));

        if (hasProfessionalTitle && !hasKeywordMatch) {
            // Has a professional context but it doesn't match our target's context
            console.log(`    [Collision Penalty] Name match but no keyword overlap for ${platform}: ${link}`);
            score -= 25;
        }
    }

    // 5. Penalty System (instead of hard disqualification for some terms)
    // Low-weight markers that imply it MIGHT be a post rather than a profile
    const softDisqualifiers = ['posted', 'shared', 'mentioned', 'reposted', 'tweeted'];
    softDisqualifiers.forEach(term => {
        if (rawSnippet.toLowerCase().includes(term)) score -= 15;
    });

    // 6. Business Page Penalty
    const businessPatterns = ["global", "solutions", "team", "services", "corporate", "agency", "consulting"];
    const isLikelyBusiness = businessPatterns.some(p => link.includes(p) || title.includes(p));
    const titleIsPersonal = title.includes(personName.toLowerCase());

    if (isLikelyBusiness && !titleIsPersonal && !combinedText.includes("founder") && !combinedText.includes("ceo")) {
        score -= 60;
    }

    // 7. PRIMARY SOURCE BOOST (LinkedIn Precision)
    if (platform === 'linkedin') {
        score += 10; // Explicit boost for professional verification source
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
        else if (link.includes('t.me/')) platform = 'telegram';
        else if (link.includes('tiktok.com')) platform = 'tiktok';
        else if (link.includes('pinterest.com')) platform = 'pinterest';
        else if (link.includes('youtube.com')) platform = 'youtube';
        else if (link.includes('snapchat.com')) platform = 'snapchat';
        else if (link.includes('reddit.com')) platform = 'reddit';
        else if (link.includes('crunchbase.com/person/')) platform = 'crunchbase';
        else if (link.includes('medium.com')) platform = 'medium';
        else if (link.includes('stackoverflow.com/users/')) platform = 'stackoverflow';
        else if (link.includes('behance.net')) platform = 'behance';
        else if (link.includes('dribbble.com')) platform = 'dribbble';
        else if (link.includes('linktr.ee')) platform = 'linktree';
        else if (link.includes('about.me')) platform = 'aboutme';
        else if (link.includes('wikipedia.org')) platform = 'wikipedia';
        else if (link.includes('imdb.com/name/')) platform = 'imdb';
        else if (link.includes('bumble.com')) platform = 'bumble';

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
        if (identityScore < 20) {
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

export const supportedPlatformDomains = [
    'linkedin.com/in/', 'en.wikipedia.org', 'imdb.com/name/', 'github.com', 'twitter.com', 'x.com', 'instagram.com',
    'facebook.com', 't.me/', 'tiktok.com', 'pinterest.com', 'youtube.com',
    'snapchat.com', 'reddit.com', 'crunchbase.com/person/', 'medium.com',
    'stackoverflow.com/users/', 'behance.net', 'dribbble.com', 'linktr.ee', 'about.me', 'bumble.com'
];

export { calculateIdentityScore };
