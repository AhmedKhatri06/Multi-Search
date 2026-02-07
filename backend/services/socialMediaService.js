// Social Media Discovery Service
const platformPriority = {
    'linkedin': 1,
    'github': 2,
    'twitter': 3,
    'x': 3,
    'instagram': 4,
    'facebook': 5
};

const profilePatterns = {
    // Exact profile matches only - no /p/, /reel/, /stories/, /tags/
    instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?$/,
    // LinkedIn profiles - usually /in/
    linkedin: /^https?:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/,
    github: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/,
    // Twitter/X profiles
    twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?$/,
    // Facebook profiles/pages (excluding posts, photos, groups, marketplace)
    facebook: /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?$/
};

const disqualifyingPatterns = [
    'posted', 'shared', 'mentioned', 'tagged', 'commented', 'liked',
    'reposted', 'retweeted', 'photo by', 'video by', 'post by',
    'see photos', 'view profile of people named', 'search results',
    '/p/', '/posts/', '/status/', '/photos/', '/videos/', '/reel/', '/stories/',
    '/groups/', '/marketplace/', '/watch/', '/search/', '?ref=', '/events/'
];

function calculateIdentityScore(result, personName, keywords = [], location = '') {
    let score = 0;
    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || '').toLowerCase();
    const link = (result.link || '').toLowerCase();
    const combinedText = `${title} ${snippet}`.toLowerCase();

    // Name matching (0-40 points) - improved to check snippet too
    const nameParts = personName.toLowerCase().split(' ');
    let nameMatches = 0;
    nameParts.forEach(part => {
        if (part.length < 2) return; // Skip very short parts
        if (title.includes(part) || snippet.includes(part)) nameMatches++;
    });
    score += (nameMatches / nameParts.length) * 40;

    // Keywords matching (0-30 points)
    if (keywords.length > 0) {
        let keywordMatches = 0;
        keywords.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                keywordMatches++;
            }
        });
        score += Math.min(keywordMatches * 10, 30);
    }

    // Location matching (0-15 points)
    if (location && combinedText.includes(location.toLowerCase())) {
        score += 15;
    }

    // Professional indicators (0-15 points)
    const professionalTerms = ['engineer', 'developer', 'ceo', 'founder', 'manager', 'director', 'analyst', 'designer'];
    const hasProfessionalTerm = professionalTerms.some(term => combinedText.includes(term));
    if (hasProfessionalTerm) {
        score += 15;
    }

    return Math.round(score);
}

function containsDisqualifyingPattern(result) {
    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || '').toLowerCase();
    const link = (result.link || '').toLowerCase();
    const combinedText = `${title} ${snippet} ${link}`;

    return disqualifyingPatterns.some(pattern => combinedText.includes(pattern));
}

function isValidProfileUrl(url, platform) {
    const pattern = profilePatterns[platform];
    if (!pattern) return false;
    return pattern.test(url);
}

export function extractSocialAccounts(internetResults, personName, keywords = [], location = '') {
    const socialAccounts = [];
    const seenUrls = new Set();

    internetResults.forEach(result => {
        const link = result.link || '';
        const title = result.title || '';

        // Detect platform
        let platform = null;
        if (link.includes('linkedin.com')) platform = 'linkedin';
        else if (link.includes('github.com')) platform = 'github';
        else if (link.includes('twitter.com') || link.includes('x.com')) platform = 'twitter';
        else if (link.includes('instagram.com')) platform = 'instagram';
        else if (link.includes('facebook.com')) platform = 'facebook';

        if (!platform) return;

        // Validate profile URL
        if (!isValidProfileUrl(link, platform)) return;

        // Check for disqualifying patterns
        if (containsDisqualifyingPattern(result)) return;

        // Calculate identity score
        const identityScore = calculateIdentityScore(result, personName, keywords, location);

        // Reject low confidence matches (lowered from 50 to 30 for better detection)
        if (identityScore < 30) return;

        // Avoid duplicates
        if (seenUrls.has(link)) return;
        seenUrls.add(link);

        // Extract username
        const username = link.split('/').filter(Boolean).pop();

        socialAccounts.push({
            platform: platform.charAt(0).toUpperCase() + platform.slice(1),
            username,
            url: link,
            confidence: identityScore >= 60 ? 'high' : identityScore >= 40 ? 'medium' : 'low',
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

    return socialAccounts;
}

export { calculateIdentityScore };
