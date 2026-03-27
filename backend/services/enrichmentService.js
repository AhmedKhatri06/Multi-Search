import EnrichCache from '../models/EnrichCache.js';
import { generateEmailPatterns } from '../utils/emailPatterns.js';
import { validateEmail } from './emailValidator.js';
import { searchPublicSignals } from './osintService.js';
import { enrichWithHunter } from '../providers/hunter.js';
import { enrichWithSnov } from '../providers/snov.js';
import { enrichWithApollo } from '../providers/apollo.js';

import { performSearch } from '../routes/multiSearch.js';

/**
 * Attempt to find a corporate domain from a company name.
 */
async function findDomain(company) {
    if (!company || company.length < 2) return null;
    
    // Check if company already looks like a domain
    if (company.includes('.') && !company.includes(' ')) return company;

    console.log(`[Enrich] Discovering domain for: ${company.slice(0, 100)}...`);
    const cleanCompany = company.split(/[(),|]/)[0].trim().slice(0, 64);
    const results = await performSearch(`${cleanCompany} official website`, true).catch(() => []);
    if (results && results.length > 0) {
        // Look for the first clean corporate link
        for (const res of results) {
            const url = res.url || res.link || "";
            if (url.includes('linkedin.com') || url.includes('facebook.com') || url.includes('instagram.com')) continue;
            try {
                const domain = new URL(url).hostname.replace('www.', '');
                if (domain && domain.includes('.')) return domain;
            } catch (e) {}
        }
    }
    return null;
}

/**
 * Main enrichment orchestration engine.
 */
export async function enrichContact(name, company, domain = null) {
    let activeDomain = domain;
    if (!activeDomain && company) {
        activeDomain = await findDomain(company);
    }

    if (!activeDomain) {
        console.warn(`[Enrich] No domain found for ${name} at ${company}. Pattern discovery skipped.`);
    }

    const cacheKey = `${name}:${company}:${activeDomain || 'no-domain'}`.toLowerCase();
    
    // 1. Check Cache
    const cached = await EnrichCache.findOne({ key: cacheKey });
    if (cached) {
        console.log(`[Enrich] Cache Hit: ${name}`);
        return cached.data;
    }

    let bestResult = null;
    let maxScore = 0;

    // 2. Free Layer: Pattern Matching & MX Check (Cost: 0)
    console.log(`[Enrich] Starting Free Layer for ${name}...`);
    const patterns = generateEmailPatterns(name, domain);
    const validations = await Promise.all(patterns.map(p => validateEmail(p)));
    
    for (let i = 0; i < validations.length; i++) {
        const v = validations[i];
        if (v.valid && v.mx) {
            const score = 40; // Base score for MX valid pattern
            if (score > maxScore) {
                maxScore = score;
                bestResult = {
                    email: patterns[i],
                    source: 'Pattern Discovery (MX Verified)',
                    confidence: score,
                    verificationStatus: 'verified'
                };
            }
        }
    }

    // 3. Free Layer: OSINT / Public Signals (Cost: 0)
    if (maxScore < 70) {
        console.log(`[Enrich] Searching public signals...`);
        const publicEmails = await searchPublicSignals(name, company, domain);
        for (const email of publicEmails) {
            const v = await validateEmail(email);
            if (v.valid) {
                const score = v.mx ? 70 : 50;
                if (score > maxScore) {
                    maxScore = score;
                    bestResult = {
                        email,
                        source: 'Public Documents / OSINT',
                        confidence: score,
                        verificationStatus: v.mx ? 'verified' : 'found'
                    };
                }
            }
        }
    }

    // 4. Provider Waterfall (Cost: API Credits - Only if free layer is weak)
    if (maxScore < 70) {
        console.log(`[Enrich] Free layers insufficient. Starting provider waterfall...`);
        
        const providers = [
            { name: 'Hunter', fn: enrichWithHunter },
            { name: 'Snov', fn: enrichWithSnov },
            { name: 'Apollo', fn: enrichWithApollo }
        ];

        for (const provider of providers) {
            if (!activeDomain) break; // Providers mostly need domains
            console.log(`[Enrich] Trying ${provider.name}...`);
            const res = await provider.fn(name, activeDomain);
            if (res && res.email) {
                // Verify provider result if not already verified
                const v = await validateEmail(res.email);
                const score = (res.confidence || 70) + (v.mx ? 10 : 0);
                
                if (score > maxScore) {
                    maxScore = score;
                    bestResult = {
                        ...res,
                        confidence: score,
                        verificationStatus: v.mx ? 'verified' : res.verificationStatus
                    };
                }
                
                if (maxScore >= 80) break; // Stop waterfall if we have high confidence
            }
        }
    }

    if (bestResult) {
        // Save to Cache
        await EnrichCache.create({
            key: cacheKey,
            data: bestResult
        }).catch(e => console.error('[Enrich] Cache save failed:', e.message));
        
        return bestResult;
    }

    return {
        email: null,
        source: 'None',
        confidence: 0,
        verificationStatus: 'not_found'
    };
}

export default { enrichContact };
