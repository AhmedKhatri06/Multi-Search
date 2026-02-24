import { useEffect, useState, useRef } from "react";
import "../index.css";

const API_URL = import.meta.env.VITE_API_URL;



const getPlatformEmoji = (platform) => {
    if (!platform) return '🔗';
    const p = platform.toLowerCase();
    if (p.includes('linkedin')) return '💼';
    if (p.includes('github')) return '💻';
    if (p.includes('twitter') || p.includes('x')) return '🐦';
    if (p.includes('instagram')) return '📸';
    if (p.includes('facebook')) return '👥';
    return '🔗';
};

const MultiSearchPage = () => {
    // Workflow Stages
    const STAGES = {
        ENTRY: "ENTRY",
        IDENTIFYING: "IDENTIFYING",
        SELECTING: "SELECTING",
        DEEP_LOADING: "DEEP_LOADING",
        DASHBOARD: "DASHBOARD"
    };

    const SEARCH_MODES = {
        GENERAL: "GENERAL",
        PHONE: "PHONE"
    };

    const COUNTRIES = [
        { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', prefix: '+93' },
        { code: 'AL', name: 'Albania', flag: '🇦🇱', prefix: '+355' },
        { code: 'DZ', name: 'Algeria', flag: '🇩🇿', prefix: '+213' },
        { code: 'AS', name: 'American Samoa', flag: '🇦🇸', prefix: '+1' },
        { code: 'AD', name: 'Andorra', flag: '🇦🇩', prefix: '+376' },
        { code: 'AO', name: 'Angola', flag: '🇦🇴', prefix: '+244' },
        { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', prefix: '+44' },
        { code: 'US', name: 'United States', flag: '🇺🇸', prefix: '+1' },
        { code: 'IN', name: 'India', flag: '🇮🇳', prefix: '+91' },
    ].sort((a, b) => b.prefix.length - a.prefix.length); // Match longest prefix first

    const [stage, setStage] = useState(() => localStorage.getItem("lookup-stage") || STAGES.ENTRY);
    const [searchMode, setSearchMode] = useState(SEARCH_MODES.GENERAL);
    const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
    const [showCountryDropdown, setShowCountryDropdown] = useState(false);
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
    const countryDropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (countryDropdownRef.current && !countryDropdownRef.current.contains(event.target)) {
                setShowCountryDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Auto-Country Detection
    useEffect(() => {
        if (searchMode === SEARCH_MODES.PHONE && query.startsWith('+')) {
            const matched = COUNTRIES.find(c => query.startsWith(c.prefix));
            if (matched && matched.code !== selectedCountry.code) {
                setSelectedCountry(matched);
            }
        }
    }, [query, searchMode, COUNTRIES, selectedCountry]);

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
        const clean = phone.replace(/\D/g, "");
        if (clean.length <= 4) return "****";
        return `+${clean.slice(0, 2)} ******${clean.slice(-4)}`;
    };

    const maskEmail = (email) => {
        if (!email) return "";
        const [user, domain] = email.split("@");
        if (!domain) return "****@****";
        return user.slice(0, 2) + "******@" + domain;
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

    const INTEL_LOGS = [
        "Initializing global intelligence handshake...",
        "Querying distributed social nodes...",
        "Analyzing career metadata footprints...",
        "Cross-referencing location signal data...",
        "Decrypting public API clusters...",
        "Heuristic analysis in progress...",
        "Mapping digital associations...",
        "Verifying identity consistency...",
        "Finalizing intelligence bundle..."
    ];

    const LoadingChecklist = ({ title, progress, currentStep, onCancel }) => {
        const loadingMessages = [
            "Capturing digital signals",
            "Diving into the deep web",
            "Uncovering hidden insights",
            "Following the digital trail",
            "Finalizing intel bundle"
        ];

        return (
            <div className="workflow-loading-screen modern-glass-mode">
                <div className="ambient-glow-bg"></div>

                <button className="cancel-pill" onClick={onCancel} title="Cancel Search">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span>Cancel</span>
                </button>

                <div className="floating-intelligence-pill">
                    <div className="pill-top-section">
                        <div className="ai-status-orb">
                            <div className="orb-inner"></div>
                            <div className="orb-pulse"></div>
                        </div>
                        <div className="ai-header-info">
                            <span className="ai-label">INTEL CORE ACTIVE</span>
                            <h2 className="ai-target-title">{data?.personaName || query}</h2>
                        </div>
                    </div>

                    <div className="pill-progress-section">
                        <div className="liquid-progress-container">
                            <div className="liquid-progress-fill" style={{ width: `${progress}%` }}>
                                <div className="liquid-wave"></div>
                            </div>
                        </div>

                        <div className="pill-meta-row">
                            <div className="pill-status-message">
                                <span className="status-dot"></span>
                                <span className="status-text">{loadingMessages[currentStep]}</span>
                            </div>
                            <div className="pill-percentage-bubble">
                                {Math.floor(progress)}%
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const groupCandidates = (data) => {
        // Sort: Local results first, then by name length descending
        const sortedData = [...data].sort((a, b) => {
            if (a.source === "local" && b.source !== "local") return -1;
            if (a.source !== "local" && b.source === "local") return 1;
            return (b.name || "").length - (a.name || "").length;
        });

        const groups = [];

        sortedData.forEach(item => {
            const name = (item.name || "").toLowerCase().trim();
            if (!name) return;

            let matchedGroup = groups.find(group => {
                const groupName = group.name.toLowerCase().trim();
                const itemSource = item.source || "Unknown";
                const groupSource = group.source || "Unknown";

                // 1. NEVER merge different sources to avoid "Hybrid Cards"
                if (itemSource !== groupSource) return false;

                // 2. Only merge if names are identical
                return groupName === name;
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
                // Keep the "Verified" local record's name as primary if available
                if (item.source === "local" && matchedGroup.source !== "local") {
                    matchedGroup.name = item.name;
                    matchedGroup.source = "local";
                } else if (item.name.length > matchedGroup.name.length && matchedGroup.source !== "local") {
                    // Otherwise keep the longest descriptive name for internet results
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

    const handleIdentify = async (precisionData = null) => {
        // Ensure precisionData is actually a data object, not a React Event
        const isData = precisionData && typeof precisionData === 'object' && !precisionData.nativeEvent;
        const searchData = isData ? precisionData : null;

        const searchName = searchData ? searchData.name : query;
        if (!searchName || typeof searchName !== 'string' || !searchName.trim()) return;

        // Sync the search bar with the new name if coming from the precision form
        if (precisionData) setQuery(searchName);

        setStage(STAGES.IDENTIFYING);
        setCandidates([]);

        const finalQuery = searchMode === SEARCH_MODES.PHONE
            ? (searchName.startsWith('+') ? searchName : `${selectedCountry.prefix}${searchName}`)
            : searchName;

        const VITE_API_URL = API_URL || "http://localhost:5000";
        try {
            const res = await fetch(`${VITE_API_URL}/api/multi-search/identify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: finalQuery,
                    keywords: precisionData?.keyword || "",
                    number: precisionData?.number || ""
                }),
            });

            if (!res.ok) throw new Error(`API failed with status ${res.status}`);

            const result = await res.json();

            if (result.directResolve && result.resolvedPersona) {
                console.log("[Search] Direct Resolve Triggered:", result.personaName);
                // Immediately proceed to Deep Search with the resolved persona
                setData({ personaName: result.personaName }); // Store for progress bar
                handleCandidateSelect(result.resolvedPersona);
            } else if (result.candidates && result.candidates.length > 0) {
                const grouped = groupCandidates(result.candidates);
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
        setData(prev => ({ ...prev, personaName: candidate.name })); // Ensure name shows in loader
        const VITE_API_URL = API_URL || "http://localhost:5000";
        try {
            const res = await fetch(`${VITE_API_URL}/api/multi-search/deep`, {
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
            alert("Failed to retrieve deep search details. Please check your connection.");
        }
    };



    const handleFeedbackSubmit = async (e) => {
        e.preventDefault();
        if (!feedbackData.name) return;

        setShowFeedbackForm(false);
        handleIdentify(feedbackData);
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
                    <img src="/logo.png" alt="Lookup Logo" style={{ height: '60px', objectFit: 'contain' }} />
                </div>

                <div className="nav-search-container">
                    {stage !== STAGES.ENTRY && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button className="nav-btn secondary" onClick={handleGoBack} style={{ border: '1px solid var(--border-light)', padding: '6px 12px', fontSize: '0.8rem', background: '#fff', borderRadius: 'var(--radius-md)', height: '40px' }}>
                                ← Back
                            </button>
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
                            <div className={`hero-search-container animate-fade-up ${searchMode === SEARCH_MODES.PHONE ? 'phone-mode' : ''}`}>
                                <div className="mode-toggle-wrapper">
                                    <button
                                        className={`mode-btn ${searchMode === SEARCH_MODES.GENERAL ? 'active' : ''}`}
                                        onClick={() => setSearchMode(SEARCH_MODES.GENERAL)}
                                        title="General Search"
                                    >
                                        🔍
                                    </button>
                                    <button
                                        className={`mode-btn ${searchMode === SEARCH_MODES.PHONE ? 'active' : ''}`}
                                        onClick={() => setSearchMode(SEARCH_MODES.PHONE)}
                                        title="Number Search"
                                    >
                                        📞
                                    </button>
                                </div>

                                {searchMode === SEARCH_MODES.PHONE && (
                                    <div className="country-selector-box" ref={countryDropdownRef}>
                                        <div className="phone-prefix" onClick={() => setShowCountryDropdown(!showCountryDropdown)}>
                                            <span className="flag">{selectedCountry.flag}</span>
                                            <span className="prefix">{selectedCountry.prefix}</span>
                                            <span className="chevron">▼</span>
                                        </div>
                                        {showCountryDropdown && (
                                            <div className="country-dropdown">
                                                {COUNTRIES.map((c) => (
                                                    <div key={c.code} className="country-option" onClick={() => { setSelectedCountry(c); setShowCountryDropdown(false); }}>
                                                        <span className="option-flag">{c.flag}</span>
                                                        <span className="option-name">{c.name}</span>
                                                        <span className="option-prefix">{c.prefix}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <input
                                    className="hero-search-input"
                                    type={searchMode === SEARCH_MODES.PHONE ? "tel" : "text"}
                                    inputMode={searchMode === SEARCH_MODES.PHONE ? "tel" : "text"}
                                    placeholder={searchMode === SEARCH_MODES.PHONE ? "Enter mobile number..." : "Enter name, email, or digital identity..."}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleIdentify()}
                                    autoFocus
                                />
                                <button className="hero-search-btn" onClick={() => handleIdentify()}>
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
                        <div className="animate-fade-up" style={{ marginBottom: '2rem' }}>
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
                            <button className="nav-btn secondary" onClick={() => {
                                setFeedbackData({ name: query, keyword: '', number: '' });
                                setShowFeedbackForm(true);
                            }} style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                                Person Not Found
                            </button>
                        </div>
                    </div>
                )}

                {/* 3. Dashboard View (Two-Column SaaS Layout) */}
                {stage === STAGES.DASHBOARD && deepData && (
                    <div className="dashboard-container" style={{ paddingTop: '0' }}>

                        {/* PROFILE HERO: Premium Glassmorphic Header */}
                        <section className="profile-hero animate-fade-up">
                            <div className="hero-blur-bg"></div>
                            <div className="profile-hero-content">
                                <div className="profile-avatar-container">
                                    <img
                                        src={deepData.person.primaryImage || "https://ui-avatars.com/api/?name=" + encodeURIComponent(deepData.person.name) + "&background=0D8ABC&color=fff"}
                                        alt={deepData.person.name}
                                        className="profile-avatar"
                                        onError={(e) => { e.target.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(deepData.person.name) + "&background=0D8ABC&color=fff"; }}
                                    />
                                    <div className="avatar-status-ring"></div>
                                </div>
                                <div className="profile-info">
                                    <div className="profile-tags">
                                        <span className="source-pill">VERIFIED IDENTITY</span>
                                        {deepData.person.location && <span className="location-pill">📍 {deepData.person.location}</span>}
                                    </div>
                                    <h1 className="profile-name">{deepData.person.name}</h1>
                                    <p className="profile-subtitle">{deepData.person.description || "Intelligence Synthesis Target"}</p>

                                    <div className="profile-quick-links">
                                        {deepData.person.phoneNumbers?.length > 0 && (
                                            <div className="social-pill-link" style={{ cursor: 'pointer' }} onClick={() => toggleReveal(deepData.person.phoneNumbers[0])}>
                                                <span className="platform-icon">📞</span>
                                                <span className="platform-name">
                                                    {revealedNumbers.has(deepData.person.phoneNumbers[0])
                                                        ? deepData.person.phoneNumbers[0]
                                                        : maskPhone(deepData.person.phoneNumbers[0])}
                                                </span>
                                            </div>
                                        )}
                                        {deepData.person.emails?.length > 0 && (
                                            <div className="social-pill-link" style={{ cursor: 'pointer' }} onClick={() => toggleReveal(deepData.person.emails[0])}>
                                                <span className="platform-icon">✉️</span>
                                                <span className="platform-name">
                                                    {revealedNumbers.has(deepData.person.emails[0])
                                                        ? deepData.person.emails[0]
                                                        : maskEmail(deepData.person.emails[0])}
                                                </span>
                                            </div>
                                        )}
                                        {deepData.socials.map((social, i) => (
                                            <a key={i} href={social.url} target="_blank" rel="noreferrer" className="social-pill-link" title={social.platform}>
                                                <span className="platform-icon">{getPlatformEmoji(social.platform)}</span>
                                                <span className="platform-name">{social.platform}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="results-container">
                            {/* RIGHT: Categorized structured results */}
                            <section className="results-feed">

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
                                        <h3 className="category-title">Social Media Handles</h3>
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
                                            <h3 className="category-title">Internal Archive Dossiers</h3>
                                            <span className="category-count">{deepData.localData.length} Records</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {deepData.localData.map((item, idx) => (
                                                <div key={idx} className="saas-card animate-scale-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span className={`source-badge ${item.source === 'SQLite' ? 'badge-sqlite' : 'badge-mongodb'}`}>
                                                            {item.source} Datastore
                                                        </span>
                                                    </div>
                                                    <p className="card-desc" style={{ fontSize: '0.9rem', color: 'var(--primary)', fontWeight: 500, margin: 0 }}>{item.text}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </section>
                        </div>
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
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>NAME</label>
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
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>KEYWORD</label>
                                <input
                                    className="hero-search-input"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)', position: 'relative', zIndex: 9002 }}
                                    value={feedbackData.keyword}
                                    onChange={(e) => setFeedbackData({ ...feedbackData, keyword: e.target.value })}
                                    placeholder="e.g. Student at MIT"
                                />
                            </div>
                            <div className="form-group">
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>NUMBER (LOCAL ONLY)</label>
                                <input
                                    className="hero-search-input"
                                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)', position: 'relative', zIndex: 9002 }}
                                    value={feedbackData.number}
                                    onChange={(e) => setFeedbackData({ ...feedbackData, number: e.target.value })}
                                    placeholder="e.g. 91xxxxxxxxxx"
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '3rem' }}>
                            <button type="button" className="nav-btn secondary" onClick={() => setShowFeedbackForm(false)}>Cancel Search</button>
                            <button type="submit" className="nav-btn primary" disabled={savingFeedback}>
                                {savingFeedback ? "Searching..." : "Search Person"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

        </div>
    );
};

export default MultiSearchPage;
