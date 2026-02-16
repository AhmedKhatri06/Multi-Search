import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api/multi-search';

async function testSearch(query) {
    console.log(`\n--- Testing Search: "${query}" ---`);
    try {
        const response = await axios.post(`${BASE_URL}/identify`, { name: query });
        console.log(`Found ${response.data.length} candidates:`);
        response.data.forEach((c, i) => {
            console.log(`${i + 1}. ${c.name} [Source: ${c.source}] - ${c.phoneNumbers?.join(', ') || 'No phones'}`);
        });

        if (response.data.length > 0) {
            const first = response.data[0];
            console.log(`\nPerforming Deep Search for: ${first.name}...`);
            const deep = await axios.post(`${BASE_URL}/deep`, { person: first });
            console.log(`Deep Results for ${deep.data.person.name}:`);
            console.log(`- Verified Phones: ${deep.data.person.phoneNumbers?.join(', ') || 'None'}`);
            console.log(`- Socials: ${deep.data.socials.length}`);
            console.log(`- Local Records: ${deep.data.localData.length}`);
        }
    } catch (err) {
        console.error('Test failed:', err.response?.data || err.message);
    }
}

async function run() {
    // Test 1: Phone Search (Based on True.csv data)
    await testSearch('916360001044');

    // Test 2: Name Search
    await testSearch('Venu');
}

run();
