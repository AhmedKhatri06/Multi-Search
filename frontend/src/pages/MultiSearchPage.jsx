import { useEffect, useState } from "react";
import "../index.css";

const API_URL = import.meta.env.VITE_API_URL;

const MultiSearchPage = () => {
    // Workflow Stages
    const STAGES = {
        ENTRY: "ENTRY",
        IDENTIFYING: "IDENTIFYING",
        SELECTING: "SELECTING",
        DEEP_LOADING: "DEEP_LOADING",
        DASHBOARD: "DASHBOARD"
    };

    const [stage, setStage] = useState(() => localStorage.getItem("nexa-stage") || STAGES.ENTRY);
    const [query, setQuery] = useState(() => localStorage.getItem("search-query") || "");
    const [data, setData] = useState(null);
    const [candidates, setCandidates] = useState(() => {
        const saved = localStorage.getItem("nexa-candidates");
        return saved ? JSON.parse(saved) : [];
    });
    const [loading, setLoading] = useState(false);
    const [deepData, setDeepData] = useState(() => {
        const saved = localStorage.getItem("nexa-deep-data");
        return saved ? JSON.parse(saved) : null;
    });
    const [recent, setRecent] = useState([]);

    // Stage 6: Preview Modal
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewPlatform, setPreviewPlatform] = useState("");

    // Feedback Form State
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [feedbackData, setFeedbackData] = useState({ name: "", keyword: "", location: "" });
    const [savingFeedback, setSavingFeedback] = useState(false);

    // Progress Simulation State
    const [loadProgress, setLoadProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);

    // Simulated Progress Logic
    useEffect(() => {
        let interval;
        if (stage === STAGES.IDENTIFYING || stage === STAGES.DEEP_LOADING) {
            setLoadProgress(0);
            setCurrentStep(0);
            interval = setInterval(() => {
                setLoadProgress(prev => {
                    const next = prev + Math.random() * 15;
                    if (next >= 100) return 100;
                    return next;
                });
                setCurrentStep(prev => prev < 4 ? prev + 1 : 4);
            }, 1500);
        } else {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [stage]);

    useEffect(() => {
        if (data) {
            console.log("FULL DATA:", data);
        }
    }, [data]);

    // Persistence Sync
    useEffect(() => {
        localStorage.setItem("nexa-stage", stage);
    }, [stage]);

    useEffect(() => {
        localStorage.setItem("search-query", query);
    }, [query]);

    useEffect(() => {
        localStorage.setItem("nexa-candidates", JSON.stringify(candidates));
    }, [candidates]);

    useEffect(() => {
        localStorage.setItem("nexa-deep-data", JSON.stringify(deepData));
    }, [deepData]);

    // Load recent searches on refresh
    useEffect(() => {
        const saved = JSON.parse(localStorage.getItem("recent-searches")) || [];
        setRecent(saved);
    }, []);

    const LoadingChecklist = ({ title, progress, currentStep }) => {
        const steps = [
            "Signals captured successfully",
            "Deep dive completed",
            "Uncovering hidden insights...",
            "Following the trail...",
            "Finalizing the search..."
        ];

        return (
            <div className="workflow-loading-screen">
                <div className="loader-orbit">
                    <div className="loader-orbit-ring"></div>
                    <div className="loader-central-image">
                        <img src="/images/placeholder_person.png" alt="Searching" />
                        <div className="loader-lock-icon">🔒</div>
                    </div>
                </div>

                <div className="loading-checklist">
                    <h3 className="checklist-title">{title}</h3>
                    {steps.map((step, idx) => (
                        <div key={idx} className={`checklist-item ${idx < currentStep ? 'completed' : idx === currentStep ? 'active' : ''}`}>
                            <div className="check-circle"></div>
                            <span>{step}</span>
                        </div>
                    ))}
                    <div className="loader-progress-bar">
                        <div className="loader-progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
            </div>
        );
    };

    const handleIdentify = async () => {
        if (!query.trim()) return;
        setStage(STAGES.IDENTIFYING);
        setCandidates([]);

        // Use configured URL or fallback to localhost:5000
        const baseUrl = API_URL || "http://localhost:5000";

        try {
            const res = await fetch(`${baseUrl}/api/multi-search/identify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: query }),
            });

            if (!res.ok) throw new Error(`API failed with status ${res.status}`);

            const result = await res.json();

            if (Array.isArray(result) && result.length > 0) {
                setCandidates(result);
                setStage(STAGES.SELECTING);
            } else {
                console.log("No candidates found or invalid response:", result);
                setStage(STAGES.ENTRY);
                setShowFeedbackForm(true);
            }
        } catch (err) {
            console.error("Identification failed:", err);
            setStage(STAGES.ENTRY);
            alert("Search service is currently unreachable. Please ensure the backend is running on port 5000.");
        }
    };

    const handleCandidateSelect = async (candidate) => {
        setStage(STAGES.DEEP_LOADING);
        const baseUrl = API_URL || "http://localhost:5000";
        try {
            const res = await fetch(`${baseUrl}/api/multi-search/deep`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ person: candidate }),
            });

            if (!res.ok) throw new Error(`Deep Search failed with status ${res.status}`);

            const result = await res.json();
            setDeepData(result);
            setStage(STAGES.DASHBOARD);

            const updated = [candidate.name, ...recent.filter(r => r !== candidate.name)].slice(0, 5);
            setRecent(updated);
            localStorage.setItem("recent-searches", JSON.stringify(updated));
        } catch (err) {
            console.error("Deep Search failed:", err);
            setStage(STAGES.SELECTING);
            alert("Failed to retrieve deep search details. Please check your connection.");
        }
    };

    const handleFeedbackSubmit = async (e) => {
        e.preventDefault();
        if (!feedbackData.name || !feedbackData.keyword) return;

        const baseUrl = API_URL || "http://localhost:5000";
        try {
            setSavingFeedback(true);
            const res = await fetch(`${baseUrl}/api/multi-search/forminfo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(feedbackData),
            });

            if (res.ok) {
                setShowFeedbackForm(false);
                // Trigger deep search for the newly provided details as a manual candidate
                const manualCandidate = {
                    name: feedbackData.name,
                    description: feedbackData.keyword,
                    location: feedbackData.location,
                    confidence: "Manual",
                    source: "internet"
                };
                handleCandidateSelect(manualCandidate);
            } else {
                alert("Failed to save feedback.");
            }
        } catch (err) {
            console.error("Feedback failed:", err);
            alert("Connection error while saving feedback.");
        } finally {
            setSavingFeedback(false);
        }
    };

    const handleReset = () => {
        setStage(STAGES.ENTRY);
        setQuery("");
        setDeepData(null);
        setCandidates([]);
        setShowFeedbackForm(false);
        // Clear persistence
        localStorage.removeItem("nexa-stage");
        localStorage.removeItem("search-query");
        localStorage.removeItem("nexa-candidates");
        localStorage.removeItem("nexa-deep-data");
    };

    const openPreview = (url, platform) => {
        setPreviewUrl(url);
        setPreviewPlatform(platform);
    };

    return (
        <div className="nexa-search-page">
            {stage === STAGES.IDENTIFYING && (
                <LoadingChecklist title={`Collecting signals for ${query}...`} progress={loadProgress} currentStep={currentStep} />
            )}

            {stage === STAGES.DEEP_LOADING && (
                <LoadingChecklist title={`Deep search on ${candidates.find(c => true)?.name || query}...`} progress={loadProgress} currentStep={currentStep} />
            )}

            {/* Header */}
            <div className="nexa-header">
                <div className="nexa-header-content">
                    <h1 className="nexa-title">Look<sup>UP</sup></h1>
                </div>
            </div>

            {/* Search Section (Entry & Selecting) */}
            {(stage === STAGES.ENTRY || stage === STAGES.SELECTING) && (
                <div className="nexa-search-container">
                    <div className="nexa-search-bar">
                        {stage === STAGES.SELECTING && (
                            <button className="nexa-back-btn" onClick={handleReset}>← Back</button>
                        )}
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleIdentify()}
                            placeholder="Search for a person..."
                            className="nexa-search-input"
                        />
                        <button className="nexa-search-btn" onClick={handleIdentify}>SEARCH</button>
                    </div>
                </div>
            )}

            {/* Selecting View (Stage 3) */}
            {stage === STAGES.SELECTING && (
                <div className="results-wrapper">
                    <div className="candidates-section">
                        <h2 className="section-title">Who are you looking for?</h2>
                        <div className="candidates-grid">
                            {candidates.map((person, idx) => (
                                <div key={idx} className="candidate-card" onClick={() => handleCandidateSelect(person)}>
                                    <div className="candidate-info">
                                        <h3>{person.name}</h3>
                                        <p className="candidate-desc">{person.description}</p>
                                        {person.location && <p className="candidate-loc">📍 {person.location}</p>}
                                    </div>
                                    <div className={`candidate-confidence ${person.confidence?.toLowerCase()}`}>
                                        {person.confidence}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="search-anyway-btn" onClick={() => {
                            setFeedbackData({ name: query, keyword: "", location: "" });
                            setShowFeedbackForm(true);
                        }}>
                            Person not Found?
                        </button>
                    </div>
                </div>
            )}

            {/* Dashboard View (Stage 5) */}
            {stage === STAGES.DASHBOARD && deepData && (
                <div className="results-wrapper deep-results container">
                    <div className="nexa-search-container" style={{ marginBottom: '3rem' }}>
                        <div className="nexa-search-bar">
                            <button className="nexa-back-btn" onClick={() => setStage(STAGES.SELECTING)}>← Back</button>
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleIdentify()}
                                placeholder="Search for another person..."
                                className="nexa-search-input"
                            />
                            <button className="nexa-search-btn" onClick={handleIdentify}>SEARCH</button>
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="card-header">
                            <div className="card-header-icon">
                                <span style={{ width: '12px' }}></span>
                                <span style={{ width: '8px' }}></span>
                                <span style={{ width: '16px' }}></span>
                            </div>
                            <h3>Gallery</h3>
                        </div>
                        <div className="image-gallery-swipe">
                            {deepData.images && deepData.images.length > 0 ? (
                                deepData.images.map((img, idx) => (
                                    <div key={idx} className="gallery-item">
                                        <img src={img} alt="Portrait" onError={(e) => e.target.parentElement.style.display = 'none'} />
                                    </div>
                                ))
                            ) : (
                                <div className="gallery-item placeholder">
                                    <img src="/images/placeholder_person.png" alt="No images found" />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="verification-prompt">
                        <p>Is this the person you were looking for?</p>
                        <div className="verification-buttons">
                            <button className="verify-btn yes">Yes, this is them</button>
                            <button className="verify-btn no" onClick={() => {
                                setFeedbackData({ name: deepData.person.name, keyword: "", location: "" });
                                setShowFeedbackForm(true);
                            }}>No, search again</button>
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="card-header">
                            <div className="card-header-icon">
                                <span style={{ width: '8px' }}></span>
                                <span style={{ width: '16px' }}></span>
                                <span style={{ width: '12px' }}></span>
                            </div>
                            <h3>Sources</h3>
                        </div>

                        <div className="sources-chips-grid">
                            {[...deepData.socials, ...(deepData.articles || [])].map((source, i) => {
                                const url = source.url;
                                const domain = (() => {
                                    try { return new URL(url).hostname.replace('www.', ''); }
                                    catch (e) { return source.platform || "source"; }
                                })();
                                const title = source.username || source.handle || source.title || "View Source";

                                return (
                                    <a key={i} href={url} target="_blank" rel="noreferrer" className="source-chip">
                                        <img
                                            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                            alt=""
                                            className="source-chip-favicon"
                                            onError={(e) => e.target.style.display = 'none'}
                                        />
                                        <div className="source-chip-info">
                                            <span className="source-chip-title">{title}</span>
                                            <div className="source-chip-footer">
                                                <span className="source-chip-domain">{domain}</span>
                                                <span className="source-chip-number">{i + 1}</span>
                                            </div>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                    </div>

                    {/* Local Evidence Section */}
                    {deepData.localData && deepData.localData.length > 0 && (
                        <div className="card-section local-data-section">
                            <h2>📂 Internal Records</h2>
                            <div className="full-sources-list">
                                {deepData.localData.map((item, idx) => (
                                    <div key={idx} className="candidate-card" style={{ cursor: 'default', borderStyle: 'dashed' }}>
                                        <div className="candidate-info">
                                            <h3>{item.source} Record</h3>
                                            <p className="candidate-desc">{item.text.substring(0, 200)}...</p>
                                        </div>
                                        <span className="badge verified">Verified Internal</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="card-section ai-summary-section">
                        <h2>✨ AI Insights</h2>
                        <div className="summary-container">
                            <p className="summary-text">{deepData.aiSummary?.message || "Synthesizing professional background..."}</p>
                        </div>
                    </div>

                    <div className="card-section">
                        <div className="related-queries">
                            <div className="card-header">
                                <div className="card-header-icon">
                                    <span style={{ width: '16px' }}></span>
                                    <span style={{ width: '12px' }}></span>
                                    <span style={{ width: '10px' }}></span>
                                </div>
                                <h3>Related</h3>
                            </div>

                            {[
                                `Who is ${deepData.person.name}?`,
                                `${deepData.person.name} professional background`,
                                `What is ${deepData.person.name}'s profession?`,
                                `Does ${deepData.person.name} have an online portfolio?`,
                                `What are ${deepData.person.name}'s interests?`
                            ].map((q, idx) => (
                                <button key={idx} className="related-query-btn" onClick={() => {
                                    setQuery(q);
                                    handleIdentify();
                                }}>
                                    <span>{q}</span>
                                    <span className="arrow">→</span>
                                </button>
                            ))}

                            <div className="follow-up-container">
                                <div className="follow-up-bar">
                                    <span className="follow-up-icon">🔗</span>
                                    <input type="text" placeholder="Ask a follow-up" />
                                </div>
                                <div className="follow-up-action">
                                    💬
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Stage 6: Preview Modal */}
            {previewUrl && (
                <div className="modal-overlay" onClick={() => setPreviewUrl(null)}>
                    <div className="feedback-modal" style={{ maxWidth: '90%', height: '80vh', padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1rem', background: '#1a1a1c', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>{previewPlatform} Preview</span>
                            <button onClick={() => setPreviewUrl(null)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>
                        <iframe src={previewUrl} style={{ width: '100%', height: 'calc(100% - 60px)', border: 'none' }} title="Preview" />
                    </div>
                </div>
            )}

            {/* Feedback Modal */}
            {showFeedbackForm && (
                <div className="modal-overlay">
                    <form className="feedback-modal" onSubmit={handleFeedbackSubmit}>
                        <h2 className="section-title" style={{ textAlign: 'left', marginBottom: '1rem' }}>Help us improve</h2>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Provide more context to narrow down the search.</p>
                        <div className="form-group">
                            <label>Full Name</label>
                            <input
                                type="text"
                                value={feedbackData.name}
                                onChange={(e) => setFeedbackData({ ...feedbackData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Profession / Company</label>
                            <input
                                type="text"
                                value={feedbackData.keyword}
                                onChange={(e) => setFeedbackData({ ...feedbackData, keyword: e.target.value })}
                                placeholder="e.g. Senior Developer at Google"
                                required
                            />
                        </div>
                        <div className="form-group">
                            <label>Location</label>
                            <input
                                type="text"
                                value={feedbackData.location}
                                onChange={(e) => setFeedbackData({ ...feedbackData, location: e.target.value })}
                                placeholder="e.g. San Francisco, CA"
                            />
                        </div>
                        <div className="modal-actions">
                            <button type="button" className="cancel-btn" onClick={() => setShowFeedbackForm(false)}>Cancel</button>
                            <button type="submit" className="submit-btn" disabled={savingFeedback}>
                                {savingFeedback ? "Synthesizing..." : "Search Again"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default MultiSearchPage;
