import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export async function searchInternet(query) {
    try {
        const data = JSON.stringify({
            "q": query,
            "num": 20
        });

        const config = {
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: {
                'X-API-KEY': process.env.SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await axios(config);
        const results = response.data?.organic || [];

        return results.map((item, index) => ({
            id: `google-${index}`,
            title: item.title,
            snippet: item.snippet,
            link: item.link,
            thumbnail: item.imageUrl, // Serper uses imageUrl
            source: 'Google'
        }));
    } catch (error) {
        console.error('Internet search failed:', error.response?.data || error.message);
        return [];
    }
}

/**
 * Specialized Image Search using Serper.dev
 * Filters results to ensure they match the target name and aren't generic group/directory shots.
 */
export async function searchImages(query, targetName = "", contextKeywords = "") {
    try {
        const data = JSON.stringify({
            "q": query,
            "num": 20
        });

        const config = {
            method: 'post',
            url: 'https://google.serper.dev/images',
            headers: {
                'X-API-KEY': process.env.SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            data: data
        };

        const response = await axios(config);
        const results = response.data?.images || [];

        // Post-Search Filtering
        const filtered = results.filter(item => {
            const title = (item.title || "").toLowerCase();
            const source = (item.link || "").toLowerCase();
            const targetLower = targetName.toLowerCase();
            const contextLower = contextKeywords.toLowerCase();

            // 1. Hyper-Strict Name Match (Requirement: ALL significant name parts)
            if (targetName && targetName.length > 2) {
                const nameParts = targetLower.split(' ').filter(p => p.length > 2);
                const hasAllParts = nameParts.every(part => title.includes(part) || source.includes(part));
                if (!hasAllParts) return false;
            }

            // 2. Disambiguation Check (Context Match)
            if (contextKeywords && contextKeywords.length > 3) {
                const contextParts = contextLower.split(' ').filter(p => p.length > 3);
                // If title mentions a DIFFERENT company but our context is set, be suspicious
                // (Optional enhancement, for now we just log context)
            }

            // 3. Anti-Group/Directory Filter
            const junkKeywords = ["profiles", "members", "team", "group", "directory", "staff", "faculty", "associates", "class of", "stock photo", "generic", "everyone", "people named", "community"];
            const isJunk = junkKeywords.some(kw => title.includes(kw));
            if (isJunk) return false;

            // 4. Broken Thumbnail Filter
            if (!item.imageUrl || item.imageUrl.length < 10) return false;

            return true;
        });

        return filtered.map((item, index) => ({
            id: `image-${index}`,
            title: item.title,
            imageUrl: item.imageUrl,
            thumbnailUrl: item.thumbnailUrl,
            sourceUrl: item.link,
            source: 'Google Images'
        }));
    } catch (error) {
        console.error('Image search failed:', error.response?.data || error.message);
        return [];
    }
}
