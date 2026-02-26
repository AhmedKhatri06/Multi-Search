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
    // Exact profile matches or with query params
    instagram: /^https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+\/?(\?.*)?$/,
    // LinkedIn profiles - support regional subdomains (in.linkedin.com, uk.linkedin.com)
    linkedin: /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?(\?.*)?$/,
    github: /^https?:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/,
    // Twitter/X profiles
    twitter: /^https?:\/\/(www\.)?(twitter|x)\.com\/[a-zA-Z0-9_]+\/?(\?.*)?$/,
    // Facebook profiles/pages (support query params)
    facebook: /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+\/?(\?.*)?$/
};

const disqualifyingPatterns = [
    'posted', 'shared', 'mentioned', 'tagged', 'commented', 'liked',
    'reposted', 'retweeted', 'photo by', 'video by', 'post by',
    'see photos', 'view profile of people named', 'search results',
    '/p/', '/posts/', '/status/', '/photos/', '/videos/', '/reel/', '/stories/',
    '/groups/', '/marketplace/', '/watch/', '/search/', '/events/'
];

function calculateIdentityScore(result, personName, keywords = [], location = '', targetEmails = [], targetPhones = []) {
    let score = 0;
    const title = (result.title || '').toLowerCase();
    const snippet = (result.snippet || result.text || '').toLowerCase();
    const link = (result.url || result.link || '').toLowerCase();
    const combinedText = `${title} ${snippet}`.toLowerCase();

    // ID ANCHORING: If we find a known email or phone, it's a guaranteed match (+100)
    const hasEmailMatch = targetEmails.some(email =>
        combinedText.includes(email.toLowerCase()) || link.includes(email.toLowerCase())
    );
    const hasPhoneMatch = targetPhones.some(phone => {
        const clean = phone.replace(/\D/g, '');
        return clean.length > 5 && (combinedText.includes(clean) || link.includes(clean));
    });

    if (hasEmailMatch || hasPhoneMatch) {
        console.log(`    [Identity Anchor] MATCH FOUND: ${hasEmailMatch ? 'Email' : 'Phone'} -> ${link}`);
        return 100;
    }

    // Name matching (0-45 points)
    const nameParts = personName.toLowerCase().split(' ').filter(p => p.length > 2);
    if (nameParts.length === 0) return 0;

    let nameMatches = 0;
    nameParts.forEach(part => {
        if (title.includes(part) || snippet.includes(part) || link.includes(part)) nameMatches++;
    });
    score += (nameMatches / nameParts.length) * 45;

    // Keywords matching (0-30 points)
    if (keywords.length > 0) {
        let keywordMatches = 0;
        keywords.forEach(keyword => {
            if (combinedText.includes(keyword.toLowerCase())) {
                keywordMatches++;
            }
        });
        score += Math.min(keywordMatches * 15, 30);
    }

    // Location matching (0-15 points)
    if (location && (combinedText.includes(location.toLowerCase()) || link.includes(location.toLowerCase()))) {
        score += 15;
    }

    // Professional indicators (0-10 points)
    const professionalTerms = ['engineer', 'developer', 'ceo', 'founder', 'manager', 'director', 'analyst', 'designer', 'profile'];
    const hasProfessionalTerm = professionalTerms.some(term => combinedText.includes(term));
    if (hasProfessionalTerm) {
        score += 10;
    }

    return Math.round(score);
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

export function extractSocialAccounts(internetResults, personName, keywords = [], location = '', targetEmails = [], targetPhones = []) {
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

        // Calculate identity score with anchoring support
        const identityScore = calculateIdentityScore(result, personName, keywords, location, targetEmails, targetPhones);

        // Reject low confidence matches
        if (identityScore < 30) {
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

    console.log(`[Social Discovery] Final count: ${socialAccounts.length}`);
    return socialAccounts;
}

export { calculateIdentityScore };
