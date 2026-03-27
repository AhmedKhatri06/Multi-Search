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
            domain: domain,
            api_key: apiKey
        }, {
            timeout: 10000
        });

        const person = response.data?.person;
        if (!person || !person.email) return null;

        return {
            email: person.email,
            source: 'Apollo.io',
            confidence: 90, // Apollo is generally high confidence if it finds a match
            verificationStatus: person.email_status || 'verified'
        };
    } catch (err) {
        console.error('[Apollo] Enrichment failed:', err.response?.data || err.message);
        return null;
    }
}

export default { enrichWithApollo };
