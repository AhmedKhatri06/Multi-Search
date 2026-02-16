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

    const [stage, setStage] = useState(() => localStorage.getItem("lookup-stage") || STAGES.ENTRY);
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
    const [revealedNumbers, setRevealedNumbers] = useState(new Set());

    const toggleReveal = (phone) => {
        setRevealedNumbers(prev => {
            const next = new Set(prev);
            if (next.has(phone)) next.delete(phone);
            else next.add(phone);
            return next;
        });
    };

    const maskPhone = (phone) => {
        if (!phone) return "";
        if (phone.length <= 4) return "****";
        return phone.slice(0, 2) + "*******" + phone.slice(-3);
    };

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
        localStorage.setItem("lookup-stage", stage);
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

    const LoadingChecklist = ({ title, progress, currentStep, onCancel }) => {
        const steps = [
            "Signals captured successfully",
            "Deep dive completed",
            "Insights uncovered",
            "Following the trail...",
            "Finalizing the search..."
        ];

        return (
            <div className="workflow-loading-screen">
                {/* Background Animation Nodes */}
                <div className="bg-nodes-container">
                    {[...Array(6)].map((_, i) => <div key={i} className="bg-node" style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, animationDelay: `${i * 0.5}s` }}></div>)}
                </div>

                <button className="cancel-query-btn" onClick={onCancel} title="Cancel Search">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <div className="loading-content-wrapper">
                    <div className="loader-orbit">
                        <div className="loader-orbit-ring"></div>
                        <div className="central-persona-wrapper">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                        </div>
                    </div>

                    <div className="loading-info-compact">
                        <div className="deep-search-text">
                            Intelligence Deep Dive on <span>{query}</span>
                        </div>

                        <div className="sleek-progress-bar">
                            <div className="sleek-progress-fill" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>

                    <div className="vertical-checklist">
                        {steps.map((step, idx) => (
                            <div key={idx} className={`checklist-step ${idx < currentStep ? 'completed' : idx === currentStep ? 'active' : ''}`}>
                                <div className="step-status-icon">
                                    {idx < currentStep ? (
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                            <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    ) : idx === currentStep ? (
                                        <div className="loader-dot-pulse"></div>
                                    ) : null}
                                </div>
                                <span style={{ opacity: idx === currentStep ? 1 : 0.8 }}>{step}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const groupCandidates = (data) => {
        // Sort by name length descending so we favor longer, more descriptive names as bases
        const sortedData = [...data].sort((a, b) => (b.name || "").length - (a.name || "").length);
        const groups = [];

        sortedData.forEach(item => {
            const name = (item.name || "").toLowerCase().trim();
            if (!name) return;

            let matchedGroup = groups.find(group => {
                const groupName = group.name.toLowerCase().trim();
                // Merge if one name is a substring of another OR they share a significant prefix
                // Minimum 4 characters to avoid generic matches like "a" or "the"
                return (groupName.includes(name) || name.includes(groupName)) && name.length >= 4;
            });

            if (matchedGroup) {
                // Merge unique descriptions
                if (item.description && item.description !== 'No description available') {
                    if (!matchedGroup.descriptions.includes(item.description)) {
                        matchedGroup.descriptions.push(item.description);
                    }
                }
                // Merge unique sources
                const itemSource = item.source || "Unknown";
                if (!matchedGroup.sources.includes(itemSource)) {
                    matchedGroup.sources.push(itemSource);
                }
                // Keep the longer name
                if (item.name.length > matchedGroup.name.length) {
                    matchedGroup.name = item.name;
                }
            } else {
                groups.push({
                    ...item,
                    descriptions: (item.description && item.description !== 'No description available') ? [item.description] : [],
                    sources: [item.source || "Unknown"]
                });
            }
        });
        return groups;
    };

    const handleIdentify = async () => {
        if (!query.trim()) return;
        setStage(STAGES.IDENTIFYING);
        setCandidates([]);

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
                const grouped = groupCandidates(result);
                setCandidates(grouped);
                setStage(STAGES.SELECTING);
            } else {
                console.log("[Search] No candidates found. Triggering Precision Search.");
                setStage(STAGES.ENTRY);
                setShowFeedbackForm(true);
            }
        } catch (err) {
            console.error("Identification failed:", err);
            setStage(STAGES.ENTRY);
            alert("Search service is currently unreachable. If you are using the deployed version, please ensure the backend is active and the API URL is configured correctly.");
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
        // Clear all persistent states
        localStorage.removeItem("lookup-stage");
        localStorage.removeItem("search-query");
        localStorage.removeItem("nexa-candidates");
        localStorage.removeItem("nexa-deep-data");
        localStorage.removeItem("recent-searches");
    };

    const handleGoBack = () => {
        if (stage === STAGES.DASHBOARD) {
            setStage(STAGES.SELECTING);
            setDeepData(null);
            localStorage.setItem("lookup-stage", STAGES.SELECTING);
            localStorage.removeItem("nexa-deep-data");
        } else if (stage === STAGES.SELECTING) {
            setStage(STAGES.ENTRY);
            localStorage.setItem("lookup-stage", STAGES.ENTRY);
        }
    };

    const handleCancel = () => {
        handleReset();
    };

    const openPreview = (url, platform) => {
        setPreviewUrl(url);
        setPreviewPlatform(platform);
    };

    return (
        <div className="saas-layout">
            {/* Top Navigation: Professional SaaS Header */}
            <nav className="navbar">
                <div className="nav-logo" onClick={handleReset} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <img src="/logo.png" alt="Lookup Logo" style={{ height: '50px', objectFit: 'contain' }} />
                </div>

                <div className="nav-search-container">
                    {stage !== STAGES.ENTRY && (
                        <div className="nav-search-bar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: 'var(--text-muted)' }}>
                                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                            </svg>
                            <input
                                className="nav-search-input"
                                placeholder="Search new target..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleIdentify()}
                            />
                        </div>
                    )}
                </div>

                <div className="nav-actions">
                    <button className="nav-btn secondary">Support</button>
                    <button className="nav-btn primary">Account</button>
                </div>
            </nav>

            {/* Global Loading Overlay */}
            {(stage === STAGES.IDENTIFYING || stage === STAGES.DEEP_LOADING) && (
                <LoadingChecklist
                    title={stage === STAGES.IDENTIFYING ? "Initial identification..." : "Deep intelligence dive..."}
                    progress={loadProgress}
                    currentStep={currentStep}
                    onCancel={handleCancel}
                />
            )}

            <main className="container">
                {/* 1. Home View (Hero Focus) */}
                {stage === STAGES.ENTRY && (
                    <div className="home-view">
                        <div className="hero-box">
                            <div className="hero-search-container animate-fade-up">
                                <input
                                    className="hero-search-input"
                                    placeholder="Enter name, email, or digital identity..."
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleIdentify()}
                                    autoFocus
                                />
                                <button className="hero-search-btn" onClick={handleIdentify}>
                                    Run Intelligence
                                </button>
                            </div>
                            <span className="hero-tag animate-fade-up">Unified Intelligence Platform</span>
                            <h1 className="hero-title animate-fade-up">High-performance data intelligence</h1>
                            <div className="trust-indicators animate-fade-up">
                                <div className="indicator">
                                    <div className="indicator-dot"></div>
                                    <span>Multi-source intelligence</span>
                                </div>
                                <div className="indicator">
                                    <div className="indicator-dot"></div>
                                    <span>AI-powered insights</span>
                                </div>
                                <div className="indicator">
                                    <div className="indicator-dot"></div>
                                    <span>Real-time results</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Selecting View (Structured Candidates) */}
                {stage === STAGES.SELECTING && (
                    <div className="selecting-view" style={{ padding: '4rem 0' }}>
                        <div className="animate-fade-up" style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <button className="nav-btn secondary" onClick={handleGoBack} style={{ border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>←</span> Back to Search
                            </button>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Potential intel matches</h2>
                        </div>
                        <div className="candidates-grid">
                            {candidates.map((person, idx) => (
                                <div key={idx} className="saas-card animate-scale-in" onClick={() => handleCandidateSelect(person)} style={{ cursor: 'pointer', alignItems: 'flex-start' }}>
                                    <div className="card-icon" style={{ marginTop: '0.25rem' }}>👤</div>
                                    <div className="card-body">
                                        <div className="card-meta">{person.confidence} Accuracy</div>
                                        <h3 className="card-title">{person.name}</h3>

                                        {person.descriptions && person.descriptions.length > 0 ? (
                                            <ul className="card-desc-list">
                                                {person.descriptions.map((desc, i) => (
                                                    <li key={i}>{desc}</li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="card-desc">{person.description || "No description available"}</p>
                                        )}

                                        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            {person.phoneNumbers && person.phoneNumbers.length > 0 && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                                                        📞 {revealedNumbers.has(person.phoneNumbers[0]) ? person.phoneNumbers[0] : maskPhone(person.phoneNumbers[0])}
                                                    </div>
                                                    <button
                                                        className="reveal-btn-sm"
                                                        onClick={(e) => { e.stopPropagation(); toggleReveal(person.phoneNumbers[0]); }}
                                                    >
                                                        {revealedNumbers.has(person.phoneNumbers[0]) ? "Hide" : "Show"}
                                                    </button>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                                {person.sources && person.sources.map((src, i) => (
                                                    <span key={i} className="card-desc" style={{ fontSize: '0.7rem', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: '12px', opacity: 0.8 }}>
                                                        📍 {src}
                                                    </span>
                                                ))}
                                                {!person.sources && person.location && <p className="card-desc" style={{ fontSize: '0.8rem', opacity: 0.8 }}>📍 {person.location}</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="animate-fade-up" style={{ marginTop: '3rem', textAlign: 'center' }}>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Don't see who you're looking for?</p>
                            <button className="nav-btn secondary" onClick={() => setShowFeedbackForm(true)} style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>Provide more details</button>
                        </div>
                    </div>
                )}

                {/* 3. Dashboard View (Two-Column SaaS Layout) */}
                {stage === STAGES.DASHBOARD && deepData && (
                    <div className="results-container">
                        <div className="animate-fade-up" style={{ gridColumn: '1 / -1', marginBottom: '2rem' }}>
                            <button className="nav-btn secondary" onClick={handleGoBack} style={{ border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span>←</span> Return to matches
                            </button>
                        </div>
                        {/* LEFT: Sticky AI Insights Sidebar */}
                        <aside className="sticky-sidebar animate-fade-up">
                            <div className="ai-insight-panel">
                                <div className="ai-badge">✨ AI SUMMARY</div>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '1rem' }}>{deepData.person.name}</h2>
                                <p style={{ fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text-soft)', marginBottom: '2rem' }}>
                                    {deepData.aiSummary?.message || "Synthesizing deep-search findings for this entity background."}
                                </p>

                                <div className="attribute-grid">
                                    <div className="attr-item">
                                        <span className="attr-label">Location</span>
                                        <span className="attr-value">{deepData.person.location || "North America"}</span>
                                    </div>
                                    <div className="attr-item">
                                        <span className="attr-label">Primary Field</span>
                                        <span className="attr-value">{deepData.person.description.split(',')[0]}</span>
                                    </div>
                                    <div className="attr-item">
                                        <span className="attr-label">Confidence Score</span>
                                        <span className="attr-value">{deepData.person.confidence}</span>
                                    </div>
                                </div>
                            </div>

                        </aside>

                        {/* RIGHT: Categorized structured results */}
                        <section className="results-feed">
                            {/* Category: Digital Identity */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">Digital Identity Card</h3>
                                    <img src="/logo.png" alt="Lookup Logo" style={{ height: '30px', objectFit: 'contain' }} />
                                </div>
                                <div className="identity-card-grid" style={{ background: '#fff' }}>
                                    <div className="identity-field">
                                        <span className="field-label">Preferred Name</span>
                                        <span className="field-value">{deepData.person.name}</span>
                                    </div>
                                    <div className="identity-field">
                                        <span className="field-label">Verified Numbers</span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {deepData.person.phoneNumbers && deepData.person.phoneNumbers.length > 0
                                                ? deepData.person.phoneNumbers.map((p, i) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <span className="field-value" style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
                                                            {revealedNumbers.has(p) ? p : maskPhone(p)}
                                                        </span>
                                                        <button
                                                            className="reveal-btn-sm"
                                                            onClick={() => toggleReveal(p)}
                                                            style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                                                        >
                                                            {revealedNumbers.has(p) ? "Hide" : "Show"}
                                                        </button>
                                                    </div>
                                                ))
                                                : <span className="field-value">Restricted Access</span>}
                                        </div>
                                    </div>
                                    <div className="identity-field">
                                        <span className="field-label">Active Presence</span>
                                        <span className="field-value">{deepData.socials.length} Platforms</span>
                                    </div>
                                    <div className="identity-field">
                                        <span className="field-label">Profession</span>
                                        <span className="field-value">{deepData.person.description || "Professional Entity"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Category: Media Gallery */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">Media Verification</h3>
                                    <span className="category-count">{deepData.images?.length || 0} Items</span>
                                </div>
                                <div className="gallery-slider">
                                    {deepData.images && deepData.images.length > 0 ? (
                                        deepData.images.map((img, idx) => (
                                            <img key={idx} src={img} className="gallery-thumbnail" alt="Evidence" onClick={() => openPreview(img, 'Media')} style={{ cursor: 'pointer' }} />
                                        ))
                                    ) : (
                                        <div className="gallery-thumbnail" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: 'var(--text-muted)' }}>
                                            No Media Data
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Category: Social Footprint */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">Platform Footprint</h3>
                                    <span className="category-count">{deepData.socials.length} Sources</span>
                                </div>
                                <div className="social-grid">
                                    {deepData.socials.map((social, i) => (
                                        <a key={i} href={social.url} target="_blank" rel="noreferrer" className="saas-card animate-scale-in" style={{ padding: '1rem', alignItems: 'center' }}>
                                            <div className="card-icon" style={{ width: '32px', height: '32px', fontSize: '1rem' }}>🔗</div>
                                            <div className="card-body">
                                                <div className="card-meta" style={{ fontSize: '0.65rem' }}>{social.platform}</div>
                                                <div className="card-title" style={{ fontSize: '0.9375rem', marginBottom: 0 }}>{social.handle || "Profile"}</div>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            </div>

                            {/* Category: Internal Archive */}
                            {deepData.localData && deepData.localData.length > 0 && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">Internal Archive Records</h3>
                                        <span className="category-count">{deepData.localData.length} Dossiers</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {deepData.localData.map((item, idx) => (
                                            <div key={idx} className="saas-card animate-scale-in" style={{ display: 'block' }}>
                                                <div className="card-meta">SOURCE ID: {item.source}</div>
                                                <p className="card-desc" style={{ marginTop: '0.5rem' }}>{item.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                )}
            </main>

            {/* Mobile Sticky CTA */}
            {stage !== STAGES.ENTRY && (
                <div className="mobile-sticky-search" onClick={handleReset}>
                    <button className="mobile-search-btn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                        </svg>
                        Start New Search
                    </button>
                </div>
            )}

            {/* Modals & Overlays */}
            {previewUrl && (
                <div className="modal-overlay" onClick={() => setPreviewUrl(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
                    <div className="preview-modal" style={{ background: '#fff', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: '1000px', height: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800 }}>{previewPlatform} Intelligence</span>
                            <button onClick={() => setPreviewUrl(null)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 700 }}>×</button>
                        </div>
                        <iframe src={previewUrl} style={{ flex: 1, border: 'none' }} title="Preview" />
                    </div>
                </div>
            )}

            {showFeedbackForm && (
                <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }} onClick={() => setShowFeedbackForm(false)}>
                    <form className="saas-card" onSubmit={handleFeedbackSubmit} style={{ maxWidth: '480px', width: '100%', flexDirection: 'column', padding: '3rem', position: 'relative', zIndex: 9001 }} onClick={e => e.stopPropagation()}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>Precision Search</h2>
                        <p style={{ color: 'var(--text-soft)', marginBottom: '2rem', fontSize: '0.9375rem' }}>Provide additional attributes to improve target identification.</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>FULL NAME</label>
                                <input
                                    className="hero-search-input"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)', position: 'relative', zIndex: 9002 }}
                                    value={feedbackData.name}
                                    onChange={(e) => setFeedbackData({ ...feedbackData, name: e.target.value })}
                                    autoFocus
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>ORGANIZATION / PROFESSION</label>
                                <input
                                    className="hero-search-input"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)', position: 'relative', zIndex: 9002 }}
                                    value={feedbackData.keyword}
                                    onChange={(e) => setFeedbackData({ ...feedbackData, keyword: e.target.value })}
                                    placeholder="e.g. Recruiter at Nexa"
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '3rem' }}>
                            <button type="button" className="nav-btn secondary" onClick={() => setShowFeedbackForm(false)}>Cancel</button>
                            <button type="submit" className="nav-btn primary" disabled={savingFeedback}>
                                {savingFeedback ? "Synthesizing..." : "Initiate Intelligence Search"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};

export default MultiSearchPage;
