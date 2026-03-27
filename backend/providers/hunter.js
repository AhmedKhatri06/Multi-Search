import axios from 'axios';

/**
 * Hunter.io Provider Adapter
 * 
 * @param {string} name 
 * @param {string} domain 
 * @returns {Promise<Object|null>} Normalized result
 */
export async function enrichWithHunter(name, domain) {
    const apiKey = process.env.HUNTER_API_KEY;
    if (!apiKey) return null;

    try {
        const [first, last] = name.split(' ');
        const response = await axios.get('https://api.hunter.io/v2/email-finder', {
            params: {
                domain,
                first_name: first,
                last_name: last,
                api_key: apiKey
            },
            timeout: 10000
        });

        const data = response.data?.data;
        if (!data || !data.email) return null;

        return {
            email: data.email,
            source: 'Hunter.io',
            confidence: data.score || 50,
            verificationStatus: data.verification?.status || 'unknown'
        };
    } catch (err) {
        console.error('[Hunter] Enrichment failed:', err.response?.data || err.message);
        return null;
    }
}

export default { enrichWithHunter };
