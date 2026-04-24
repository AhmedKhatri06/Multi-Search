import { generateEmailPatterns } from '../utils/emailPatterns.js';
import { validateEmail } from './emailValidator.js';
import { searchPublicSignals } from './osintService.js';
import { enrichWithSnov } from '../providers/snov.js';
import { enrichWithApollo } from '../providers/apollo.js';

import { searchFree } from '../utils/freeSearch.js';

/**
 * Attempt to find a corporate domain from a company name.
 */
async function findDomain(company) {
    if (!company || company.length < 2) return null;
    
    // Check if company already looks like a domain
    if (company.includes('.') && !company.includes(' ')) return company.toLowerCase().trim();

    console.log(`[Enrich] Discovering domain for company: ${company.slice(0, 100)}...`);
    
    // CLEANSE: Remove generic role information if it leaked into the company field
    // e.g. "Atharva Auti - Cybersecurity" -> "Atharva Auti" (still likely not a company)
    // e.g. "Software Engineer at Google" -> "Google" (Better)
    let cleanCompany = company;
    if (company.toLowerCase().includes(' at ')) {
        const parts = company.split(/ at /i);
        cleanCompany = parts[parts.length - 1] || company;
    }
    
    // TIGHTENING: Block generic enrichment stopwords that pollute domain discovery
    const stopwords = ['site', 'official', 'website', 'domain', 'google', 'search', 'bing', 'yahoo', 'profile', 'profile:', 'view', 'linkedin', 'instagram', 'facebook'];
    cleanCompany = cleanCompany.split(' ')
        .filter(word => !stopwords.includes(word.toLowerCase().replace(/[:]/g, "")))
        .join(' ');

    cleanCompany = cleanCompany.split(/[(),-|]/)[0].trim().slice(0, 64);
    if (!cleanCompany || cleanCompany.length < 2) return null;

    const results = await searchFree(`${cleanCompany} official website domain`).catch(() => []);
    if (results && results.length > 0) {
        // Look for the first clean corporate link, avoiding common consumer/social sites 
        // that pollute general company searches.
        const forbidden = ['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'crunchbase.com', 'zoominfo.com', 'glassdoor.com'];
        
        for (const res of results) {
            const url = res.url || res.link || "";
            if (forbidden.some(f => url.includes(f))) continue;
            
            try {
                const domain = new URL(url).hostname.replace('www.', '');
                if (domain && domain.includes('.') && !domain.includes('google.com')) return domain;
            } catch (e) {}
        }
    }
    return null;
}

/**
 * Main enrichment orchestration engine.
 */
export async function enrichContact(name, company, domain = null, socialProfiles = []) {
    let activeDomain = domain;
    let activeCompany = company;

    // 1. IMPROVED ANCHORING: If no company, but we have a LinkedIn profile, extract company from title
    if (!activeCompany && socialProfiles && socialProfiles.length > 0) {
        const li = socialProfiles.find(p => p.platform === 'linkedin');
        if (li && li.title) {
            const title = li.title.toLowerCase();
            let extracted = null;
            
            // Handle multiple separators: "at", "@", "|", "—"
            if (title.includes(' at ')) extracted = li.title.split(/ at /i)[1];
            else if (title.includes(' @ ')) extracted = li.title.split(' @ ')[1];
            else if (title.includes(' | ')) extracted = li.title.split(' | ')[1];
            else if (title.includes(' — ')) extracted = li.title.split(' — ')[1];
            
            if (extracted) {
                const cleanExtracted = extracted.split(/[|(),]/)[0].trim();
                console.log(`[Enrich] Anchored to company from LinkedIn: ${cleanExtracted}`);
                activeCompany = cleanExtracted;
            }
        }
    }

    if (!activeDomain && activeCompany) {
        activeDomain = await findDomain(activeCompany);
    }

    if (!activeDomain) {
        console.warn(`[Enrich] No domain found for ${name} at ${company}. Domain-dependent steps will be skipped.`);
    }

    const cacheKey = `${name}:${company}:${activeDomain || 'no-domain'}`.toLowerCase();
    
    let bestResult = null;
    let maxScore = 0;

    // 2. Free Layer: Pattern Matching & MX Check (Cost: 0) — requires domain
    if (activeDomain) {
        console.log(`[Enrich] Starting Pattern Discovery for ${name} @ ${activeDomain}...`);
        const patterns = generateEmailPatterns(name, activeDomain);
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
    }

    // 3. Free Layer: OSINT / Public Signals (Cost: 0) — runs REGARDLESS of domain
    // This is the critical path for individuals without corporate domains.
    const allEmails = [];
    const allPhones = [];

    if (maxScore < 70) {
        console.log(`[Enrich] Searching public signals for ${name}...`);
        const publicSignals = await searchPublicSignals(name, company, activeDomain);
        
        // Handle Emails
        for (const email of publicSignals.emails) {
            allEmails.push(email);
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

        // Handle Phones (OSINT discovered)
        for (const phone of publicSignals.phones) {
            allPhones.push(phone);
            if (maxScore < 50) {
                bestResult = {
                    ...bestResult,
                    phone,
                    confidence: 50,
                    source: 'Public OSINT Signal'
                };
            }
        }
    }

    // 4. Provider Waterfall (Cost: API Credits - Only if free layer is weak AND domain exists)
    if (maxScore < 70 && activeDomain) {
        console.log(`[Enrich] Free layers insufficient. Starting provider waterfall...`);
        
        const providers = [
            { name: 'Snov', fn: enrichWithSnov },
            { name: 'Apollo', fn: enrichWithApollo }
        ];

        for (const provider of providers) {
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
    } else if (maxScore < 70 && !activeDomain) {
        console.log(`[Enrich] No domain available for provider waterfall. Relying on OSINT results.`);
    }

    // Placeholder Check: Never return synthetic data
    const isPlaceholder = (e) => {
        if (!e) return true;
        const v = e.toLowerCase().trim();
        return v.includes('noemail.com') || v.includes('example.com') || v.includes('test.com');
    };

    // SOFTENED: Lowered threshold from 70 to 50 to allow "Probable" OSINT signals to show.
    // CONSOLDIDATION: Always return the full signal list, even if no 'Best' single result is found
    const finalResult = bestResult && (bestResult.email || bestResult.phone) && !isPlaceholder(bestResult.email) && (bestResult.verificationStatus === 'verified' || (bestResult.confidence >= 50))
        ? { ...bestResult }
        : { email: null, phone: null, source: 'Not Found', confidence: 0, verificationStatus: 'not_found' };

    return {
        ...finalResult,
        emails: [...new Set([...allEmails, ...(finalResult.email ? [finalResult.email] : [])])],
        phones: [...new Set([...allPhones, ...(finalResult.phone ? [finalResult.phone] : [])])]
    };
}

export default { enrichContact };
