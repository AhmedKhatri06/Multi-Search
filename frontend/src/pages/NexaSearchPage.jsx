import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function NexaSearchPage() {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [showNumberKeyboard, setShowNumberKeyboard] = useState(false);
    const [recentSearches, setRecentSearches] = useState([]);
    const [showAllHistory, setShowAllHistory] = useState(false);

    // Disambiguation state
    const [candidates, setCandidates] = useState([]);
    const [showRefinement, setShowRefinement] = useState(false);

    // Refinement form state
    const [refinementData, setRefinementData] = useState({
        name: '',
        keywords: '',
        location: '',
        number: ''
    });

    // Results state
    const [results, setResults] = useState(null);
    const [selectedPerson, setSelectedPerson] = useState(null);

    // Progress tracking state
    const [searchProgress, setSearchProgress] = useState(0);
    const [progressSteps, setProgressSteps] = useState([
        { id: 1, text: 'Signals captured successfully', status: 'pending' },
        { id: 2, text: 'Deep dive completed', status: 'pending' },
        { id: 3, text: 'Insights uncovered', status: 'pending', count: 0 },
        { id: 4, text: 'Following the trail...', status: 'pending' },
        { id: 5, text: 'Finalizing the search...', status: 'pending' }
    ]);

    useEffect(() => {
        fetchRecentSearches();
    }, []);

    const fetchRecentSearches = async () => {
        try {
            const response = await axios.get(`${API_URL}/api/nexa-search/history`);
            setRecentSearches(response.data.history || []);
        } catch (error) {
            console.error('Error fetching history:', error);
        }
    };

    // Animate progress during search
    useEffect(() => {
        if (!loading) {
            // Reset progress when not loading
            setSearchProgress(0);
            setProgressSteps([
                { id: 1, text: 'Signals captured successfully', status: 'pending' },
                { id: 2, text: 'Deep dive completed', status: 'pending' },
                { id: 3, text: 'Insights uncovered', status: 'pending', count: 0 },
                { id: 4, text: 'Following the trail...', status: 'pending' },
                { id: 5, text: 'Finalizing the search...', status: 'pending' }
            ]);
            return;
        }

        // Simulate progress animation
        const progressInterval = setInterval(() => {
            setSearchProgress(prev => {
                if (prev >= 95) return prev;
                return Math.min(prev + Math.random() * 15, 95);
            });
        }, 300);

        // Step 1: Signals captured (immediate)
        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 1 ? { ...step, status: 'completed' } : step
            ));
        }, 500);

        // Step 2: Deep dive (after 1s)
        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 2 ? { ...step, status: 'completed' } : step
            ));
        }, 1500);

        // Step 3: Insights uncovered (after 2s, with count)
        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 3 ? { ...step, status: 'active', count: Math.floor(Math.random() * 20) + 5 } : step
            ));
        }, 2500);

        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 3 ? { ...step, status: 'completed' } : step
            ));
        }, 3500);

        // Step 4: Following the trail (after 3.5s)
        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 4 ? { ...step, status: 'active' } : step
            ));
        }, 3500);

        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 4 ? { ...step, status: 'completed' } : step
            ));
        }, 4500);

        // Step 5: Finalizing (after 4.5s)
        setTimeout(() => {
            setProgressSteps(prev => prev.map(step =>
                step.id === 5 ? { ...step, status: 'active' } : step
            ));
        }, 4500);

        return () => {
            clearInterval(progressInterval);
        };
    }, [loading]);

    const handleSearch = async () => {
        if (!query.trim()) return;

        setLoading(true);
        setCandidates([]);
        setResults(null);
        setShowRefinement(false);

        try {
            // Step 1: Disambiguation - identify possible people
            const disambigResponse = await axios.post(`${API_URL}/api/nexa-search/disambiguate`, {
                query
            });

            const foundCandidates = disambigResponse.data.candidates || [];

            if (foundCandidates.length === 0) {
                // strict two-step flow: if no candidates, provide a generic option
                foundCandidates.push({
                    name: query,
                    description: "No specific profiles found. Click to perform a deep search.",
                    location: "Deep Search",
                    confidence: "neutral"
                });
            }

            // Always show the list
            setCandidates(foundCandidates);
            setLoading(false);
        } catch (error) {
            console.error('Search error:', error);
            setLoading(false);
        }
    };

    const performDeepSearch = async (searchQuery, personName, additionalData = {}) => {
        setLoading(true);
        try {
            const response = await axios.post(`${API_URL}/api/nexa-search/search`, {
                query: searchQuery,
                name: personName,
                ...additionalData
            });

            setResults(response.data);
            setSelectedPerson(personName);
            setCandidates([]);
            setShowRefinement(false);
            fetchRecentSearches();
        } catch (error) {
            console.error('Deep search error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCandidateSelect = (candidate) => {
        performDeepSearch(query, candidate.name);
    };

    const handleRefinementSubmit = (e) => {
        e.preventDefault();
        const keywords = refinementData.keywords.split(',').map(k => k.trim()).filter(Boolean);
        performDeepSearch(
            refinementData.name || query,
            refinementData.name || query,
            {
                keywords,
                location: refinementData.location,
                number: refinementData.number
            }
        );
    };

    const handleRecentSearchClick = (search) => {
        setQuery(search.name || search.query);
        performDeepSearch(search.query, search.name || search.query, {
            keywords: search.keywords || [],
            location: search.location || '',
            number: search.number || ''
        });
    };

    const handleDeleteSearch = async (e, searchId) => {
        e.stopPropagation(); // Prevent triggering the search click
        try {
            await axios.delete(`${API_URL}/api/nexa-search/history/${searchId}`);
            // Refresh the recent searches list
            fetchRecentSearches();
        } catch (error) {
            console.error('Error deleting search:', error);
        }
    };

    const handleReset = () => {
        setResults(null);
        setCandidates([]);
        setSelectedPerson(null);
        setShowRefinement(false);
    };

    return (
        <div className="nexa-search-page">
            {/* Golden Header */}
            <div className="nexa-header">
                <div className="nexa-header-content">

                    <h1 className="nexa-title">Multi-Search<sup>AI</sup></h1>
                </div>
            </div>

            {/* Search Bar */}
            <div className="nexa-search-container">
                <div className="nexa-search-bar">
                    {results && (
                        <button className="nexa-back-btn" onClick={() => {
                            setResults(null);
                            setCandidates([]);
                            setSelectedPerson(null);
                        }}>
                            ← Back
                        </button>
                    )}
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder="Search for a person..."
                        className="nexa-search-input"
                    />
                    <button className="nexa-search-btn" onClick={handleSearch} disabled={loading}>
                        {loading ? 'Searching...' : 'SEARCH'}
                    </button>
                </div>
            </div>

            {/* Recent Searches - Horizontal */}
            {!results && !candidates.length && recentSearches.length > 0 && (
                <div className="nexa-recent-searches">
                    <h3>Recent Searches</h3>
                    <div className="nexa-recent-horizontal">
                        {recentSearches.slice(0, 3).map((search, idx) => (
                            <div
                                key={idx}
                                className="nexa-recent-chip"
                                onClick={() => handleRecentSearchClick(search)}
                            >
                                <button
                                    className="nexa-chip-delete"
                                    onClick={(e) => handleDeleteSearch(e, search._id)}
                                    title="Delete search"
                                >
                                    ×
                                </button>
                                <span className="nexa-chip-name">{search.name || search.query}</span>
                                <span className="nexa-chip-time">
                                    {new Date(search.timestamp).toLocaleDateString()}
                                </span>
                            </div>
                        ))}
                        {recentSearches.length > 3 && (
                            <button
                                className="nexa-more-btn"
                                onClick={() => setShowAllHistory(!showAllHistory)}
                            >
                                {showAllHistory ? '×' : '...'}
                            </button>
                        )}
                    </div>

                    {/* Expanded History */}
                    {showAllHistory && recentSearches.length > 3 && (
                        <div className="nexa-history-expanded">
                            {recentSearches.slice(3).map((search, idx) => (
                                <div
                                    key={idx + 3}
                                    className="nexa-recent-chip"
                                    onClick={() => handleRecentSearchClick(search)}
                                >
                                    <button
                                        className="nexa-chip-delete"
                                        onClick={(e) => handleDeleteSearch(e, search._id)}
                                        title="Delete search"
                                    >
                                        ×
                                    </button>
                                    <span className="nexa-chip-name">{search.name || search.query}</span>
                                    <span className="nexa-chip-time">
                                        {new Date(search.timestamp).toLocaleDateString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Animated Progress Screen */}
            {loading && (
                <div className="nexa-progress-screen">
                    {/* Orbiting Images Container */}
                    <div className="nexa-orbit-container">
                        {/* Center Profile Image */}
                        <div className="nexa-center-image">
                            <div className="nexa-dotted-border"></div>
                            <div className="nexa-fingerprint-icon">
                                <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 11C11.45 11 11 11.45 11 12C11 12.55 11.45 13 12 13C12.55 13 13 12.55 13 12C13 11.45 12.55 11 12 11Z" fill="white" />
                                    <path d="M12 7C9.24 7 7 9.24 7 12C7 14.76 9.24 17 12 17C14.76 17 17 14.76 17 12C17 9.24 14.76 7 12 7ZM12 15C10.34 15 9 13.66 9 12C9 10.34 10.34 9 12 9C13.66 9 15 10.34 15 12C15 13.66 13.66 15 12 15Z" fill="white" opacity="0.7" />
                                    <path d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3ZM12 19C8.13 19 5 15.87 5 12C5 8.13 8.13 5 12 5C15.87 5 19 8.13 19 12C19 15.87 15.87 19 12 19Z" fill="white" opacity="0.4" />
                                </svg>
                            </div>
                        </div>

                        {/* Orbiting Profile Images */}
                        <div className="nexa-orbit-image nexa-orbit-1">
                            <div className="nexa-avatar">👤</div>
                        </div>
                        <div className="nexa-orbit-image nexa-orbit-2">
                            <div className="nexa-avatar">👤</div>
                        </div>
                        <div className="nexa-orbit-image nexa-orbit-3">
                            <div className="nexa-avatar">👤</div>
                        </div>
                        <div className="nexa-orbit-image nexa-orbit-4">
                            <div className="nexa-avatar">👤</div>
                        </div>
                        <div className="nexa-orbit-image nexa-orbit-5">
                            <div className="nexa-avatar">👤</div>
                        </div>
                        <div className="nexa-orbit-image nexa-orbit-6">
                            <div className="nexa-avatar">👤</div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="nexa-progress-bar-container">
                        <div className="nexa-progress-bar" style={{ width: `${searchProgress}%` }}></div>
                    </div>

                    {/* Search Text */}
                    <p className="nexa-search-text">Deep search on <strong>{query || 'person'}</strong>...</p>

                    {/* Social Media Icons */}
                    <div className="nexa-social-icons">
                        <span className="nexa-icon nexa-icon-linkedin">in</span>
                        <span className="nexa-icon nexa-icon-github">🐙</span>
                        <span className="nexa-icon nexa-icon-instagram">📷</span>
                        <span className="nexa-icon nexa-icon-tinder">🔥</span>
                        <span className="nexa-icon nexa-icon-snapchat">👻</span>
                        <span className="nexa-more-sources">+5 more sources</span>
                    </div>

                    {/* Progress Steps */}
                    <div className="nexa-progress-steps">
                        {progressSteps.map((step) => (
                            <div key={step.id} className={`nexa-step nexa-step-${step.status}`}>
                                <div className="nexa-step-icon">
                                    {step.status === 'completed' && <span className="nexa-checkmark">✓</span>}
                                    {step.status === 'active' && <div className="nexa-loading-dot"></div>}
                                    {step.status === 'pending' && <div className="nexa-empty-circle"></div>}
                                </div>
                                <span className="nexa-step-text">
                                    {step.text}
                                    {step.count !== undefined && step.count > 0 && (
                                        <span className="nexa-step-count"> {step.count} found</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Disambiguation List */}
            {candidates.length > 0 && !loading && (
                <div className="nexa-disambiguation">
                    <h2>Multiple people found. Please select:</h2>
                    <div className="nexa-candidates-list">
                        {candidates.map((candidate, idx) => (
                            <div
                                key={idx}
                                className="nexa-candidate-card"
                                onClick={() => handleCandidateSelect(candidate)}
                            >
                                <h3>{candidate.name}</h3>
                                <p className="nexa-candidate-desc">{candidate.description}</p>
                                {candidate.location && (
                                    <p className="nexa-candidate-location">📍 {candidate.location}</p>
                                )}
                                <span className={`nexa-confidence nexa-confidence-${candidate.confidence}`}>
                                    {candidate.confidence} confidence
                                </span>
                            </div>
                        ))}
                    </div>

                    <button
                        className="nexa-refine-btn"
                        onClick={() => setShowRefinement(true)}
                    >
                        Can't find the right person? Refine your search
                    </button>
                </div>
            )}

            {/* Refinement Form */}
            {showRefinement && (
                <div className="nexa-refinement-form">
                    <h2>Refine Your Search</h2>
                    <form onSubmit={handleRefinementSubmit}>
                        <input
                            type="text"
                            placeholder="Name *"
                            value={refinementData.name}
                            onChange={(e) => setRefinementData({ ...refinementData, name: e.target.value })}
                            required
                        />
                        <input
                            type="text"
                            placeholder="Keywords (comma-separated) *"
                            value={refinementData.keywords}
                            onChange={(e) => setRefinementData({ ...refinementData, keywords: e.target.value })}
                            required
                        />
                        <input
                            type="text"
                            placeholder="Location (optional)"
                            value={refinementData.location}
                            onChange={(e) => setRefinementData({ ...refinementData, location: e.target.value })}
                        />
                        <input
                            type="text"
                            placeholder="Phone Number (optional)"
                            value={refinementData.number}
                            onChange={(e) => setRefinementData({ ...refinementData, number: e.target.value })}
                        />
                        <div className="nexa-form-buttons">
                            <button type="submit" className="nexa-submit-btn">Search</button>
                            <button
                                type="button"
                                className="nexa-cancel-btn"
                                onClick={() => setShowRefinement(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Results */}
            {results && !loading && (
                <div className="nexa-results">


                    {/* Photo Gallery */}
                    {results.images && results.images.length > 0 && (
                        <div className="nexa-section">
                            <h3>Photos</h3>
                            <div className="nexa-gallery-scroll">
                                {results.images.map((img, idx) => (
                                    <img key={idx} src={img} alt={`Photo ${idx + 1}`} className="nexa-gallery-img" />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Social Media Accounts */}
                    {results.socialAccounts && results.socialAccounts.length > 0 && (
                        <div className="nexa-social-section">
                            <h3>Social Media</h3>
                            <div className="nexa-social-grid">
                                {results.socialAccounts.map((account, idx) => (
                                    <a
                                        key={idx}
                                        href={account.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="nexa-social-btn"
                                    >
                                        <span className="nexa-social-platform">{account.platform}</span>
                                        <span className="nexa-social-username">@{account.username}</span>
                                        <span className={`nexa-social-confidence nexa-confidence-${account.confidence}`}>
                                            {account.identityScore}% match
                                        </span>
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Contact Info */}
                    {(results.contactInfo?.emails?.length > 0 || results.contactInfo?.phones?.length > 0) && (
                        <div className="nexa-contact-section">
                            <h3>Contact Information</h3>
                            {results.contactInfo.emails?.length > 0 && (
                                <div className="nexa-contact-group">
                                    <strong>Emails:</strong>
                                    <ul>
                                        {results.contactInfo.emails.map((email, idx) => (
                                            <li key={idx}>{email}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {results.contactInfo.phones?.length > 0 && (
                                <div className="nexa-contact-group">
                                    <strong>Phones:</strong>
                                    <ul>
                                        {results.contactInfo.phones.map((phone, idx) => (
                                            <li key={idx}>{phone}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Local Data */}
                    {results.localData && results.localData.length > 0 && (
                        <div className="nexa-local-data">
                            <h3>Local Database Results</h3>
                            {results.localData.slice(0, 10).map((doc, idx) => (
                                <div key={idx} className="nexa-local-item">
                                    <p>{doc.text?.substring(0, 300)}{doc.text?.length > 300 ? '...' : ''}</p>
                                    {doc.source && <span className="nexa-local-source">Source: {doc.source}</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Internet Results - Show ALL messy results like the old system */}
                    {results.internetResults && results.internetResults.length > 0 && (
                        <div className="nexa-internet-results">
                            <h3>Internet Search Results</h3>
                            {results.internetResults.map((result, idx) => (
                                <div key={idx} className="nexa-internet-item">
                                    <h4>
                                        <a href={result.link} target="_blank" rel="noopener noreferrer">
                                            {result.title}
                                        </a>
                                    </h4>
                                    <p className="nexa-internet-snippet">{result.snippet}</p>
                                    <span className="nexa-internet-source">{result.source}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default NexaSearchPage;
