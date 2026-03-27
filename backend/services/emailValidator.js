import dns from 'dns/promises';

/**
 * Validates email syntax and performs MX record check.
 * 
 * @param {string} email 
 * @returns {Promise<{ valid: boolean, mx: boolean, reason: string }>}
 */
export async function validateEmail(email) {
    const syntaxRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!syntaxRegex.test(email)) {
        return { valid: false, mx: false, reason: 'Invalid syntax' };
    }

    const domain = email.split('@')[1];

    try {
        const mxRecords = await dns.resolveMx(domain);
        if (mxRecords && mxRecords.length > 0) {
            return { valid: true, mx: true, reason: 'MX Verified' };
        }
        return { valid: true, mx: false, reason: 'No MX records' };
    } catch (err) {
        return { valid: true, mx: false, reason: `DNS Error: ${err.code || err.message}` };
    }
}

export default { validateEmail };
