import axios from 'axios';

/**
 * Apollo.io Provider Adapter
 */
export async function enrichWithApollo(name, domain) {
    const apiKey = process.env.APOLLO_API_KEY;
    if (!apiKey) return null;

    try {
        const response = await axios.post('https://api.apollo.io/v1/people/match', {
            full_name: name,
            domain: domain
        }, {
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        const person = response.data?.person;
        if (!person) return null;

        return {
            email: person.email || null,
            phone: person.phone_number || person.sanitized_phone || null,
            source: 'Apollo.io',
            confidence: 90,
            verificationStatus: person.email_status || (person.email ? 'verified' : 'not_found')
        };
    } catch (err) {
        console.error('[Apollo] Enrichment failed:', err.response?.data || err.message);
        return null;
    }
}

export default { enrichWithApollo };
