import express from 'express';
import SearchHistory from '../models/SearchHistory.js';
import Document from '../models/Document.js'; // Added MongoDB Model
import { searchInternet } from '../services/internetSearch.js';
import { extractSocialAccounts } from '../services/socialMediaService.js';
import { extractContactInfo } from '../services/contactService.js';

const router = express.Router();

// Disambiguation endpoint - SQLite + MongoDB + Internet (combined)
router.post('/disambiguate', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // 1. Search SQLite
        const { sqliteSearch } = await import('../db/sqlite.js');
        const sqliteResults = sqliteSearch(query);
        console.log(`[DEBUG] SQLite search for "${query}" returned ${sqliteResults.length} results`);

        const candidates = [];

        // Add SQLite results
        sqliteResults.slice(0, 5).forEach(person => {
            const parts = (person.text || "").split(" - ");
            const rowName = parts[0]?.trim() || "Unknown";
            const rowDesc = parts.slice(1).join(" - ").trim() || (person.description || "Person from local database");

            candidates.push({
                name: rowName,
                description: rowDesc,
                location: 'Local Database (SQLite)',
                confidence: 'high',
                source: 'local_sqlite',
                metadata: person
            });
        });

        // 2. Search MongoDB (Local Documents)
        try {
            const mongoResults = await Document.find({
                text: { $regex: query, $options: 'i' }
            }).limit(5);

            console.log(`[DEBUG] MongoDB search for "${query}" returned ${mongoResults.length} results`);

            mongoResults.forEach(doc => {
                // Create a readable title from the text (first few words)
                const title = doc.text.substring(0, 50).split('\n')[0] + '...';

                candidates.push({
                    name: title,
                    description: doc.text.substring(0, 150) + '...',
                    location: 'Local Database (MongoDB)',
                    confidence: 'high',
                    source: 'local_mongo',
                    metadata: doc
                });
            });
        } catch (err) {
            console.error('[DEBUG] MongoDB search failed/skipped:', err.message);
        }

        // 3. Search Internet (Improved Parsing for Multiple Candidates)
        const internetResults = await searchInternet(query);
        console.log(`[DEBUG] Internet search for "${query}" returned ${internetResults.length} results`);

        // Helper to normalize strings for comparison
        const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

        internetResults.forEach(result => {
            // Basic Title Parsing: "Name - Title/Description" or "Name | Organization"
            // e.g. "Dr. Pankaj Shah - Cardiologist - Hospital" -> Name: "Dr. Pankaj Shah", Desc: "Cardiologist - Hospital"
            let possibleName = result.title;
            let possibleDesc = result.snippet;

            const separators = [' - ', ' | ', ':', '—'];
            for (const sep of separators) {
                if (result.title.includes(sep)) {
                    const parts = result.title.split(sep);
                    if (parts[0].length < 40) { // Assume names aren't super long
                        possibleName = parts[0].trim();
                        possibleDesc = parts.slice(1).join(' ').trim() || result.snippet;
                        break;
                    }
                }
            }

            // Check for duplicates in existing candidates
            const exists = candidates.some(c =>
                normalize(c.name) === normalize(possibleName) ||
                (c.metadata && c.metadata.url === result.link)
            );

            if (!exists) {
                candidates.push({
                    name: possibleName,
                    description: possibleDesc.substring(0, 100) + (possibleDesc.length > 100 ? '...' : ''),
                    location: 'Internet Result',
                    confidence: 'medium',
                    source: 'internet',
                    metadata: { ...result, originalTitle: result.title }
                });
            }
        });

        // Limit total candidates to avoid overwhelming (e.g., top 8)
        const finalCandidates = candidates.slice(0, 8);
        console.log(`Total candidates found: ${finalCandidates.length}`);

        res.json({ candidates: finalCandidates });
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

        // Search SQLite
        const { sqliteSearch } = await import('../db/sqlite.js');
        const sqliteData = sqliteSearch(searchQuery);

        // Format local data
        const localData = sqliteData.map(person => {
            // If the schema is already combined in 'text', use it directly
            const displayValue = person.text || `${person.name} - ${person.title || ''} ${person.description || ''}`.trim();
            return {
                text: displayValue,
                source: person.source || 'SQLite',
                metadata: person
            };
        });

        // Search MongoDB
        try {
            const mongoResults = await Document.find({
                text: { $regex: searchQuery, $options: 'i' }
            }).limit(10);

            console.log(`[DEBUG] MongoDB deep search for "${searchQuery}" returned ${mongoResults.length} results`);

            mongoResults.forEach(doc => {
                localData.push({
                    text: doc.text,
                    source: doc.source || 'MongoDB',
                    metadata: doc
                });
            });
        } catch (err) {
            console.error('[DEBUG] MongoDB deep search failed:', err.message);
        }

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
