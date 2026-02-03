// Contact Information Extraction Service

function extractEmails(text) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = text.match(emailRegex) || [];
    return [...new Set(emails)]; // Remove duplicates
}

function extractPhones(text) {
    const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
    const phones = text.match(phoneRegex) || [];
    return [...new Set(phones)]; // Remove duplicates
}

export function extractContactInfo(results) {
    const emails = [];
    const phones = [];

    results.forEach(result => {
        const text = `${result.title || ''} ${result.snippet || ''}`;
        emails.push(...extractEmails(text));
        phones.push(...extractPhones(text));
    });

    return {
        emails: [...new Set(emails)],
        phones: [...new Set(phones)]
    };
}

export { extractEmails, extractPhones };
