import axios from 'axios';

/**
 * Snov.io Provider Adapter
 */
export async function enrichWithSnov(name, domain) {
    const userId = process.env.SNOV_USER_ID;
    const apiKey = process.env.SNOV_API_KEY;
    if (!userId || !apiKey) return null;

    try {
        const [first, last] = name.split(' ');
        
        // Snov requires an access token first
        const tokenRes = await axios.post('https://api.snov.io/v1/get-access-token', {
            grant_type: 'client_credentials',
            client_id: userId,
            client_secret: apiKey
        });

        const token = tokenRes.data?.access_token;
        if (!token) return null;

        const response = await axios.get('https://api.snov.io/v1/get-emails-from-names', {
            params: {
                firstName: first,
                lastName: last,
                domain
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 10000
        });

        const data = response.data?.data;
        if (!data || !data.email) return null;

        return {
            email: data.email,
            source: 'Snov.io',
            confidence: data.probability || 50,
            verificationStatus: data.status || 'unknown'
        };
    } catch (err) {
        console.error('[Snov] Enrichment failed:', err.response?.data || err.message);
        return null;
    }
}

export default { enrichWithSnov };
