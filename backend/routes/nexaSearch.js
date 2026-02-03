import express from 'express';
import SearchHistory from '../models/SearchHistory.js';
import { searchInternet } from '../services/internetSearch.js';
import { extractSocialAccounts } from '../services/socialMediaService.js';
import { extractContactInfo } from '../services/contactService.js';

const router = express.Router();

// Disambiguation endpoint - SQLite only (no MongoDB, no AI)
router.post('/disambiguate', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Search SQLite only
        const { sqliteSearch } = await import('../db/sqlite.js');
        const sqliteResults = sqliteSearch(query);
        console.log(`[DEBUG] SQLite search for "${query}" returned ${sqliteResults.length} results:`, sqliteResults);

        // Convert SQLite results to candidates
        const candidates = sqliteResults.slice(0, 5).map(person => ({
            name: person.name,
            description: `${person.title || ''} ${person.description || ''}`.trim() || 'Person from local database',
            location: '',
            confidence: 'high'
        }));

        console.log(`Found ${candidates.length} candidates from SQLite`);
        res.json({ candidates });
    } catch (error) {
        console.error('Disambiguation error:', error);
        res.status(500).json({ error: 'Failed to disambiguate query' });
    }
});

// Deep search endpoint - No AI, No MongoDB
router.post('/search', async (req, res) => {
    try {
        const { query, name, keywords, location, number } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Build enhanced search query
        let searchQuery = query;
        if (keywords && keywords.length > 0) {
            searchQuery += ' ' + keywords.join(' ');
        }
        if (location) {
            searchQuery += ' ' + location;
        }

        // Search SQLite only
        const { sqliteSearch } = await import('../db/sqlite.js');
        const sqliteData = sqliteSearch(searchQuery);

        // Format local data
        const localData = sqliteData.map(person => ({
            text: `${person.name} - ${person.title || ''} ${person.description || ''}`.trim(),
            source: person.source || 'SQLite',
            metadata: person
        }));

        // Search internet
        const internetResults = await searchInternet(searchQuery);

        // Extract social media accounts with identity verification
        const socialAccounts = extractSocialAccounts(
            internetResults,
            name || query,
            keywords || [],
            location || ''
        );

        // Extract contact information
        const contactInfo = extractContactInfo(internetResults);

        // Collect images
        const images = [];
        internetResults.forEach(result => {
            if (result.thumbnail) {
                images.push(result.thumbnail);
            }
        });

        // Save to search history (optional - don't fail if MongoDB unavailable)
        // Prevent duplicates: if same name/query exists, update timestamp instead of creating new entry
        try {
            const searchName = name || query;

            // Check if this search already exists
            const existingSearch = await SearchHistory.findOne({
                $or: [
                    { name: searchName },
                    { query: searchName }
                ]
            });

            if (existingSearch) {
                // Update existing search with new timestamp (moves it to top)
                existingSearch.timestamp = new Date();
                existingSearch.query = query;
                existingSearch.name = searchName;
                existingSearch.keywords = keywords || [];
                existingSearch.location = location || '';
                existingSearch.number = number || '';
                existingSearch.results = {
                    localCount: localData.length,
                    internetCount: internetResults.length,
                    socialCount: socialAccounts.length
                };
                await existingSearch.save();
                console.log(`Updated existing search history for: ${searchName}`);
            } else {
                // Create new search history entry
                const searchHistory = new SearchHistory({
                    query,
                    name: searchName,
                    keywords: keywords || [],
                    location: location || '',
                    number: number || '',
                    results: {
                        localCount: localData.length,
                        internetCount: internetResults.length,
                        socialCount: socialAccounts.length
                    }
                });
                await searchHistory.save();
                console.log(`Created new search history for: ${searchName}`);
            }
        } catch (historyError) {
            console.log('Could not save search history (MongoDB unavailable):', historyError.message);
        }

        res.json({
            query: searchQuery,
            name: name || query,
            localData,
            images: images.slice(0, 10),
            socialAccounts,
            contactInfo,
            internetResults: internetResults.slice(0, 20)
        });
    } catch (error) {
        console.error('NexaSearch error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

// Get recent searches (optional - return empty if MongoDB unavailable)
router.get('/history', async (req, res) => {
    try {
        const history = await SearchHistory.find()
            .sort({ timestamp: -1 })
            .limit(10);

        res.json({ history });
    } catch (error) {
        console.log('History unavailable (MongoDB not connected):', error.message);
        res.json({ history: [] }); // Return empty array instead of error
    }
});

// Delete a search from history
router.delete('/history/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await SearchHistory.findByIdAndDelete(id);
        res.json({ success: true, message: 'Search deleted successfully' });
    } catch (error) {
        console.error('Error deleting search:', error);
        res.status(500).json({ error: 'Failed to delete search' });
    }
});

export default router;
