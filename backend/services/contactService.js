function extractEmails(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    return [...new Set(emails)];
}

function extractPhones(text) {
    // International support: matches + or 00 followed by country code and varies separators
    const phoneRegex = /(?:\+|00)\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3}[\s.-]?\d{4,6}/g;
    const phones = text.match(phoneRegex) || [];
    return [...new Set(phones)];
}

function isPlaceholder(value) {
    if (!value) return true;
    const v = value.toLowerCase().trim();
    return v.includes('noemail.com') || 
           v.includes('example.com') || 
           v.includes('test.com') ||
           v.startsWith('+00') || 
           v === 'not found' || 
           v === 'unknown';
}

export function extractContactInfo(results) {
    const emails = [];
    const phones = [];

    results.forEach(result => {
        const text = `${result.title || ''} ${result.snippet || ''}`;
        const extractedEmails = extractEmails(text).filter(e => !isPlaceholder(e));
        const extractedPhones = extractPhones(text).filter(p => !isPlaceholder(p));
        emails.push(...extractedEmails);
        phones.push(...extractedPhones);
    });

    return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)]
    };
}

export { extractEmails, extractPhones };
