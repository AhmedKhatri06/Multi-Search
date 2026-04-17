/**
 * Privacy Utility for PII (Personally Identifiable Information) Masking.
 */

/**
 * Masks an email address: d***@e***.com
 * @param {string} email 
 * @returns {string} Masked email
 */
export const maskEmail = (email) => {
    if (!email || email.length < 3) return email || "";
    const [user, domain] = email.split('@');
    if (!domain) return "****";
    
    const maskedUser = user.length > 2 
        ? user.substring(0, 1) + "***" + user.substring(user.length - 1)
        : user.substring(0, 1) + "***";
        
    const domainParts = domain.split('.');
    const maskedDomain = domainParts[0].length > 2
        ? domainParts[0].substring(0, 1) + "***"
        : "***";
        
    return `${maskedUser}@${maskedDomain}.${domainParts.slice(1).join('.')}`;
};

/**
 * Masks a phone number: +1*******1234
 * @param {string} phone 
 * @returns {string} Masked phone number
 */
export const maskPhone = (phone) => {
    if (!phone || phone.length < 7) return phone || "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 5) return "****";
    
    // Keep prefix if starts with +
    const prefix = phone.startsWith('+') ? '+' + clean.substring(0, clean.length - 10 || 1) : "";
    const suffix = clean.substring(clean.length - 4);
    
    return `${prefix}*******${suffix}`;
};

export default { maskEmail, maskPhone };
