import axios from 'axios';

async function testEnrich() {
    console.log('--- Starting Enrichment Test ---');
    try {
        const response = await axios.post('http://localhost:5000/api/enrich', {
            name: 'Sundar Pichai',
            company: 'Google',
            domain: 'google.com'
        });
        console.log('Response:', JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error('Test Failed:', err.response?.data || err.message);
    }
}

testEnrich();
