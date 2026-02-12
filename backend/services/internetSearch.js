import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export async function searchInternet(query) {
    try {
        const response = await axios.get('https://serpapi.com/search', {
            params: {
                q: query,
                engine: 'google',
                api_key: process.env.SERPAPI_KEY,
                num: 20
            }
        });

        const results = response.data?.organic_results || [];

        return results.map((item, index) => ({
            id: `google-${index}`,
            title: item.title,
            snippet: item.snippet,
            link: item.link,
            thumbnail: item.thumbnail,
            source: 'Google'
        }));
    } catch (error) {
        console.error('Internet search failed:', error.message);
        return [];
    }
}
