import { useEffect, useState, useRef, useCallback, useContext } from "react";
import "../index.css";
import LivePreviewViewer from "../components/LivePreviewViewer";
import AuthModal from "../components/AuthModal";
import { AuthContext } from "../context/AuthContext";
import ReactMarkdown from 'react-markdown';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';




// Helper: Identify synthetic/placeholder data patterns that should NEVER be used for merging or displayed as 'Verified'
const isPlaceholder = (value) => {
    if (!value) return true;
    const v = value.toLowerCase().trim();
    return v.includes('noemail.com') || 
           v.includes('example.com') || 
           v.includes('test.com') ||
           v.startsWith('+00') || 
           v === 'not found' || 
           v === 'unknown' ||
           v === '****@****';
};

const getPlatformEmoji = (platform) => {
    if (!platform) return '🔗';
    const p = platform.toLowerCase();
    if (p.includes('linkedin')) return '💼';
    if (p.includes('github')) return '💻';
    if (p.includes('twitter') || p.includes('x')) return '🐦';
    if (p.includes('instagram')) return '📸';
    if (p.includes('facebook')) return '👥';
    if (p.includes('telegram') || p.includes('t.me')) return '🛡️';
    if (p.includes('tiktok')) return '🎵';
    if (p.includes('pinterest')) return '📌';
    if (p.includes('youtube')) return '📺';
    if (p.includes('snapchat')) return '👻';
    if (p.includes('reddit')) return '👽';
    if (p.includes('wikipedia')) return '📚';
    if (p.includes('britannica')) return '🏛️';
    if (p.includes('crunchbase')) return '🏢';
    if (p.includes('medium')) return '📝';
    if (p.includes('stack')) return '🏗️';
    if (p.includes('behance')) return '🎨';
    if (p.includes('dribbble')) return '🏀';
    if (p.includes('linktr')) return '🌳';
    if (p.includes('aboutme')) return '👤';
    return '🔗';
};

const LoadingChecklist = ({ stage, STAGES, progress, currentStep, onCancel, query, personaName }) => {
    let title = "Processing Intelligence...";
    let loadingMessages = [
        "Initializing scan",
        "Searching records",
        "Analyzing signals",
        "Extracting deep intelligence",
        "Generating report"
    ];

    if (stage === STAGES.IDENTIFYING) {
        title = "Discovering Identities...";
    } else if (stage === STAGES.REFINING) {
        title = "Refining Selection...";
        loadingMessages = [
            "Analyzing choice",
            "Pivoting search",
            "Refining metadata",
            "Improving matches",
            "Updating results"
        ];
    } else if (stage === STAGES.DEEP_LOADING) {
        title = "Acquiring Deep Intel...";
        loadingMessages = [
            "Handshaking socials",
            "Querying archives",
            "Dorking documents",
            "Aggregating data",
            "Finalizing dossier"
        ];
    }

    const clampedProgress = Math.min(Math.floor(progress), 100);

    return (
        <div className="workflow-loading-screen modern-glass-mode">
            <div className="ambient-glow-bg"></div>
            <div className="ambient-glow-bg glow-secondary"></div>

            <button className="cancel-pill" onClick={onCancel} title="Cancel Search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Cancel</span>
            </button>

            <div className="floating-intelligence-pill">
                {/* Header with Stage Info */}
                <div className="pill-header">
                    <span className="pill-badge">{title}</span>
                </div>

                {/* Scan Ring + Orb */}
                <div className="scan-ring-container">
                    <svg className="scan-ring-svg" viewBox="0 0 120 120">
                        <circle className="scan-ring-track" cx="60" cy="60" r="54" />
                        <circle
                            className="scan-ring-fill"
                            cx="60" cy="60" r="54"
                            strokeDasharray={`${clampedProgress * 3.39} ${339.29 - clampedProgress * 3.39}`}
                            strokeDashoffset="84.82"
                        />
                    </svg>
                    <div className="scan-orb">
                        <div className="scan-orb-pulse"></div>
                        <div className="scan-orb-core"></div>
                    </div>
                </div>

                {/* Target Identity */}
                <div className="pill-identity-block">
                    <h2 className="pill-target-name">{personaName || query}</h2>
                </div>

                {/* Progress Bar */}
                <div className="pill-progress-section">
                    <div className="liquid-progress-container">
                        <div className="liquid-progress-fill" style={{ width: `${clampedProgress}%` }}>
                            <div className="progress-shimmer"></div>
                        </div>
                    </div>

                    <div className="pill-meta-row">
                        <div className="pill-status-message">
                            <span className="status-dot"></span>
                            <span className="status-text">{loadingMessages[currentStep] || "Processing..."}</span>
                        </div>
                        <div className="pill-percentage-bubble">
                            {clampedProgress}%
                        </div>
                    </div>
                </div>

                {/* Step Indicators */}
                <div className="pill-steps-row">
                    {loadingMessages.map((msg, idx) => (
                        <div key={idx} className={`step-pip ${idx < currentStep ? 'completed' : ''} ${idx === currentStep ? 'active' : ''}`}>
                            <div className="pip-dot"></div>
                            {idx < loadingMessages.length - 1 && <div className="pip-connector"></div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

const MultiSearchPage = () => {
    // Workflow Stages
    const STAGES = {
        ENTRY: "ENTRY",
        IDENTIFYING: "IDENTIFYING",
        SELECTING: "SELECTING",
        REFINING: "REFINING",
        CONFIRMING: "CONFIRMING",
        ENRICHING: "ENRICHING",
        DEEP_LOADING: "DEEP_LOADING",
        DASHBOARD: "DASHBOARD"
    };

    const SEARCH_MODES = {
        GENERAL: "GENERAL",
        PHONE: "PHONE"
    };

    const COUNTRIES = [
        { code: 'US', name: 'United States', flag: '🇺🇸', prefix: '+1' },
        { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', prefix: '+44' },
        { code: 'IN', name: 'India', flag: '🇮🇳', prefix: '+91' },
        { code: 'CA', name: 'Canada', flag: '🇨🇦', prefix: '+1' },
        { code: 'AU', name: 'Australia', flag: '🇦🇺', prefix: '+61' },
        { code: 'DE', name: 'Germany', flag: '🇩🇪', prefix: '+49' },
        { code: 'FR', name: 'France', flag: '🇫🇷', prefix: '+33' },
        { code: 'IT', name: 'Italy', flag: '🇮🇹', prefix: '+39' },
        { code: 'ES', name: 'Spain', flag: '🇪🇸', prefix: '+34' },
        { code: 'BR', name: 'Brazil', flag: '🇧🇷', prefix: '+55' },
        { code: 'MX', name: 'Mexico', flag: '🇲🇽', prefix: '+52' },
        { code: 'CN', name: 'China', flag: '🇨🇳', prefix: '+86' },
        { code: 'JP', name: 'Japan', flag: '🇯🇵', prefix: '+81' },
        { code: 'KR', name: 'South Korea', flag: '🇰🇷', prefix: '+82' },
        { code: 'RU', name: 'Russia', flag: '🇷🇺', prefix: '+7' },
        { code: 'ZA', name: 'South Africa', flag: '🇿🇦', prefix: '+27' },
        { code: 'NG', name: 'Nigeria', flag: '🇳🇬', prefix: '+234' },
        { code: 'EG', name: 'Egypt', flag: '🇪🇬', prefix: '+20' },
        { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', prefix: '+966' },
        { code: 'AE', name: 'UAE', flag: '🇦🇪', prefix: '+971' },
        { code: 'SG', name: 'Singapore', flag: '🇸🇬', prefix: '+65' },
        { code: 'MY', name: 'Malaysia', flag: '🇲🇾', prefix: '+60' },
        { code: 'ID', name: 'Indonesia', flag: '🇮🇩', prefix: '+62' },
        { code: 'TH', name: 'Thailand', flag: '🇹🇭', prefix: '+66' },
        { code: 'VN', name: 'Vietnam', flag: '🇻🇳', prefix: '+84' },
        { code: 'PH', name: 'Philippines', flag: '🇵🇭', prefix: '+63' },
        { code: 'PK', name: 'Pakistan', flag: '🇵🇰', prefix: '+92' },
        { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', prefix: '+880' },
        { code: 'TR', name: 'Turkey', flag: '🇹🇷', prefix: '+90' },
        { code: 'NL', name: 'Netherlands', flag: '🇳🇱', prefix: '+31' },
        { code: 'BE', name: 'Belgium', flag: '🇧🇪', prefix: '+32' },
        { code: 'CH', name: 'Switzerland', flag: '🇨🇭', prefix: '+41' },
        { code: 'AT', name: 'Austria', flag: '🇦🇹', prefix: '+43' },
        { code: 'SE', name: 'Sweden', flag: '🇸🇪', prefix: '+46' },
        { code: 'NO', name: 'Norway', flag: '🇳🇴', prefix: '+47' },
        { code: 'DK', name: 'Denmark', flag: '🇩🇰', prefix: '+45' },
        { code: 'FI', name: 'Finland', flag: '🇫🇮', prefix: '+358' },
        { code: 'IE', name: 'Ireland', flag: '🇮🇪', prefix: '+353' },
        { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', prefix: '+64' },
        { code: 'AR', name: 'Argentina', flag: '🇦🇷', prefix: '+54' },
        { code: 'CL', name: 'Chile', flag: '🇨🇱', prefix: '+56' },
        { code: 'CO', name: 'Colombia', flag: '🇨🇴', prefix: '+57' },
        { code: 'PE', name: 'Peru', flag: '🇵🇪', prefix: '+51' },
        { code: 'PT', name: 'Portugal', flag: '🇵🇹', prefix: '+351' },
        { code: 'GR', name: 'Greece', flag: '🇬🇷', prefix: '+30' },
        { code: 'PL', name: 'Poland', flag: '🇵🇱', prefix: '+48' },
        { code: 'RO', name: 'Romania', flag: '🇷🇴', prefix: '+40' },
        { code: 'HU', name: 'Hungary', flag: '🇭🇺', prefix: '+36' },
        { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', prefix: '+420' },
        { code: 'UA', name: 'Ukraine', flag: '🇺🇦', prefix: '+380' }
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
    const [showAllDocuments, setShowAllDocuments] = useState(false);
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

    const [manualCountry, setManualCountry] = useState(false);

    // Auto-Country Detection & Auto-Switch to Phone Mode
    useEffect(() => {
        if (manualCountry) return; // Stop auto-detect if user manually selected

        if (searchMode === SEARCH_MODES.GENERAL) {
            // Auto switch to phone mode if they type a plus followed by numbers
            if (query.startsWith('+') && query.length > 2 && /^\+\d+/.test(query.replace(/\s/g, ''))) {
                setSearchMode(SEARCH_MODES.PHONE);
                
                // Try to detect country
                const matched = COUNTRIES.find(c => query.startsWith(c.prefix));
                if (matched) setSelectedCountry(matched);
            }
        }
    }, [query, searchMode, COUNTRIES, manualCountry]);


    // Stage 6: Preview Modal
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewPlatform, setPreviewPlatform] = useState("");
    const [previewIsSocial, setPreviewIsSocial] = useState(false);
    const [isLiveView, setIsLiveView] = useState(false);

    // Feedback Form State
    const [showFeedbackForm, setShowFeedbackForm] = useState(false);
    const [feedbackData, setFeedbackData] = useState({ name: "", keyword: "", location: "" });
    const [savingFeedback, setSavingFeedback] = useState(false);

    // Progress Simulation State
    const [loadProgress, setLoadProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState(0);
    const [revealedNumbers, setRevealedNumbers] = useState(new Set());
    const [expandedCards, setExpandedCards] = useState(new Set());
    const [overflowingCards, setOverflowingCards] = useState(new Set());

    const { user, logout } = useContext(AuthContext);
    const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
    const abortControllerRef = useRef(null);

    // B-001: Extract Search Parameters Automatically=
    const cardRefs = useRef({});

    const checkCardOverflows = useCallback(() => {
        const newOverflowing = new Set();
        Object.entries(cardRefs.current).forEach(([idx, el]) => {
            if (el && el.scrollHeight > 200) {
                newOverflowing.add(Number(idx));
            }
        });
        setOverflowingCards(newOverflowing);
    }, []);

    useEffect(() => {
        if (candidates.length > 0) {
            // Small delay to let DOM render
            const timer = setTimeout(checkCardOverflows, 100);
            return () => clearTimeout(timer);
        }
    }, [candidates, checkCardOverflows]);

    const toggleReveal = (phone) => {
        setRevealedNumbers(prev => {
            const next = new Set(prev);
            if (next.has(phone)) next.delete(phone);
            else next.add(phone);
            return next;
        });
    };

    const maskPhone = (phone) => {
        if (!phone || isPlaceholder(phone)) return "";
        const clean = phone.replace(/\D/g, "");
        if (clean.length <= 4) return "****";
        return `+${clean.slice(0, 2)} ******${clean.slice(-4)}`;
    };

    const maskEmail = (email) => {
        if (!email || isPlaceholder(email)) return "";
        const [user, domain] = email.split("@");
        if (!domain) return "****@****";
        return user.slice(0, 2) + "******@" + domain;
    };

    // Unified Progress & Step Logic
    useEffect(() => {
        let interval;
        if (stage === STAGES.IDENTIFYING || stage === STAGES.REFINING || stage === STAGES.DEEP_LOADING) {
            interval = setInterval(() => {
                setLoadProgress(prev => {
                    const target = stage === STAGES.IDENTIFYING ? 48.5 : (stage === STAGES.REFINING ? 78.5 : 99.2);
                    if (prev < target) {
                        const remaining = target - prev;
                        // Move 5% of the remaining distance or at least a tiny random amount
                        const step = Math.max(remaining * 0.05, Math.random() * 0.1);
                        return Math.min(prev + step, 99.9);
                    }
                    // If somehow at or past target, move by tiny micro-increments
                    return Math.min(prev + 0.01, 99.9);
                });
            }, 200);
        } else {
            clearInterval(interval);
        }
        return () => clearInterval(interval);
    }, [stage]);

    // Update currentStep based on progress
    useEffect(() => {
        if (loadProgress < 20) setCurrentStep(0);
        else if (loadProgress < 40) setCurrentStep(1);
        else if (loadProgress < 60) setCurrentStep(2);
        else if (loadProgress < 80) setCurrentStep(3);
        else setCurrentStep(4);
    }, [loadProgress]);

    // History Synchronization & Mount Setup
    useEffect(() => {
        // Initialize base history state on mount
        if (!window.history.state || !window.history.state.stage) {
            window.history.replaceState({ stage: STAGES.ENTRY }, "", window.location.pathname);
        }

        const handlePopState = (event) => {
            if (event.state && event.state.stage) {
                setStage(event.state.stage);
            } else {
                setStage(STAGES.ENTRY);
            }
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // Push history for stable stages only (skipping IDENTIFYING / DEEP_LOADING)
    useEffect(() => {
        const currentPath = window.location.pathname;
        const currentHistoryStage = window.history.state?.stage;

        if (currentHistoryStage !== stage) {
            if (stage === STAGES.SELECTING || stage === STAGES.DASHBOARD) {
                window.history.pushState({ stage }, "", currentPath);
            } else if (stage === STAGES.ENTRY && currentHistoryStage !== STAGES.ENTRY) {
                // Ensure the 'Home' state is reconciled if we manually set back to entry
                window.history.replaceState({ stage: STAGES.ENTRY }, "", currentPath);
            }
        }
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



    const groupCandidates = (list) => {
        if (!list || !Array.isArray(list)) return [];
        return list.map((item, index) => ({
            id: `cand-${index}-${Date.now()}`,
            name: item.title || item.name || "Unknown Identity",
            description: item.subtitle || item.description || "No description available",
            source: item.source || "Internet",
            url: item.url || ""
        }));
    };

    const cancelSearch = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            console.log("[Search] Cancellation Signal Sent");
        }
    };

    const handleIdentify = async (precisionData = null, isRefinement = false) => {
        cancelSearch();
        abortControllerRef.current = new AbortController();

        let searchName = precisionData ? precisionData.name : query;
        const searchKeyword = precisionData ? precisionData.keyword : "";
        const searchNumber = precisionData ? precisionData.number : "";

        // If it's a phone search from the modal, prioritize the number
        if (searchMode === SEARCH_MODES.PHONE && searchNumber) {
            searchName = searchNumber;
        }

        if (!searchName || !searchName.trim()) return;

        setCandidates([]);
        setShowFeedbackForm(false);
        setLoadProgress(10); 
        setStage(STAGES.IDENTIFYING);
        setQuery(searchName);

        const VITE_API_URL = API_URL || "http://localhost:5000";

        try {
            const res = await fetch(`${VITE_API_URL}/api/multi-search/identify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: searchName,
                    keywords: searchKeyword,
                    location: precisionData?.location || "",
                    searchMode: searchMode // Pass mode for backend disambiguation
                }),
                signal: abortControllerRef.current?.signal
            });

            if (!res.ok) throw new Error("Identify failed");

            const result = await res.json();

            if (result.candidates && result.candidates.length > 0) {
                const grouped = groupCandidates(result.candidates);
                setCandidates(grouped);
                setLoadProgress(50);
                setStage(STAGES.SELECTING);
            } else {
                console.log("[Search] No candidates found.");
                setStage(STAGES.ENTRY);
                setShowFeedbackForm(true);
            }
        } catch (err) {
            console.error("Identification failed:", err);
            setLoadProgress(0);
            setStage(STAGES.ENTRY);
        }
    };

    const handleCandidateSelect = async (candidate) => {
        setStage(STAGES.DEEP_LOADING);
        setLoadProgress(60);
        setData(prev => ({ ...prev, personaName: candidate.name }));

        const VITE_API_URL = API_URL || "http://localhost:5000";

        try {
            const res = await fetch(`${VITE_API_URL}/api/multi-search/enrichment`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ person: candidate }),
                signal: abortControllerRef.current?.signal
            });

            if (!res.ok) throw new Error("Enrichment failed");

            const result = await res.json();
            
            // Map the result to match the dashboard structure
            const enrichedData = {
                person: {
                    ...result.confirmedIdentity,
                    name: result.confirmedIdentity.name,
                    description: result.confirmedIdentity.description,
                    emails: result.emails || [],
                    phoneNumbers: result.phoneNumbers || [],
                    aiSummary: result.aiSummary || "Analysis complete. Dossier finalized."
                },
                socials: result.profiles || [],
                documents: result.documents || [],
                externalDocuments: result.documents || [], // Map for compatibility
                images: (result.images || []).map(img => ({
                    original: img,
                    thumbnail: img,
                    title: "Evidence Discovery"
                }))
            };

            setDeepData(enrichedData);
            setLoadProgress(100);
            setStage(STAGES.DASHBOARD);
        } catch (err) {
            console.error("Enrichment failed:", err);
            setStage(STAGES.SELECTING);
        }
    };



    const handleFeedbackSubmit = async (e) => {
        e.preventDefault();
        if (!feedbackData.name) return;

        setShowFeedbackForm(false);
        handleIdentify(feedbackData, true); // Pass true for isRefinement
    };

    const handleReset = () => {
        setStage(STAGES.ENTRY);
        setQuery("");
        setLoadProgress(0);
        setCurrentStep(0);
        setDeepData(null);
        setCandidates([]);
        setShowFeedbackForm(false);
        // Clear all persistent states
        localStorage.removeItem("lookup-stage");
        localStorage.removeItem("search-query");
        localStorage.removeItem("nexa-candidates");
        localStorage.removeItem("nexa-deep-data");
        localStorage.removeItem("recent-searches");

        // Reset history to clean state
        window.history.replaceState({ stage: STAGES.ENTRY }, "", "/");
    };

    const handleGoBack = () => {
        window.history.back();
    };

    const handleCancel = () => {
        cancelSearch();
        handleReset();
    };

    const openPreview = (url, platform, isSocial = false) => {
        if (platform && (platform.toLowerCase() === 'wikipedia' || platform.toLowerCase() === 'britannica')) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        setPreviewUrl(url);
        setPreviewPlatform(platform);
        setPreviewIsSocial(isSocial);
        setIsLiveView(isSocial); // Default to live for social, normal for others
    };

    const renderPlatformMirror = (platform, url) => {
        const p = platform.toLowerCase();
        const personaName = deepData?.person?.name || "Target Profile";

        if (p.includes('linkedin')) {
            return (
                <div className="linkedin-shell animate-fade-up">
                    <div className="linkedin-cover-placeholder">
                        <div className="linkedin-profile-abs">
                            <div className="linkedin-photo-circle">👤</div>
                        </div>
                    </div>
                    <div className="linkedin-body">
                        <div className="linkedin-identity">
                            <h2>{personaName}</h2>
                            <p className="linkedin-headline">{deepData?.person?.description || "Professional Profile on LinkedIn"}</p>
                            <p className="linkedin-subline">{deepData?.person?.location || "Global Network"}</p>
                        </div>
                        <div className="linkedin-actions">
                            <a href={url} target="_blank" rel="noreferrer" className="ln-btn-primary">View Full Profile</a>
                            <a href={url} target="_blank" rel="noreferrer" className="ln-btn-secondary">Message</a>
                        </div>
                    </div>
                </div>
            );
        }

        if (p.includes('facebook')) {
            return (
                <div className="facebook-shell">
                    <div className="fb-header-strip">
                        <div className="fb-logo-mock">f</div>
                    </div>
                    <div className="fb-profile-section animate-fade-up">
                        <div className="fb-cover-photo"></div>
                        <div className="fb-profile-info-row">
                            <div className="fb-profile-pic">👤</div>
                            <div className="fb-name-stack">
                                <h1>{personaName}</h1>
                                <span className="fb-friends-count">Profile Details</span>
                            </div>
                        </div>
                    </div>
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                        <a href={url} target="_blank" rel="noreferrer" className="premium-action-btn" style={{ maxWidth: '300px', margin: '0 auto' }}>
                            Continue to Facebook
                        </a>
                    </div>
                </div>
            );
        }

        if (p.includes('instagram')) {
            return (
                <div className="instagram-shell animate-fade-up">
                    <div className="ig-profile-header">
                        <div className="ig-avatar-outer">
                            <div className="ig-avatar-inner">👤</div>
                        </div>
                        <div className="ig-info-column">
                            <div className="ig-username-row">
                                <span className="ig-username">{personaName.toLowerCase().replace(/\s/g, '_')}</span>
                                <button className="ig-follow-btn">Follow</button>
                            </div>
                            <div className="ig-stats-row">
                                <div className="ig-stat"><span>1,204</span> posts</div>
                                <div className="ig-stat"><span>852</span> followers</div>
                                <div className="ig-stat"><span>921</span> following</div>
                            </div>
                            <div className="ig-bio">
                                <h1>{personaName}</h1>
                                <p>{deepData?.person?.location}</p>
                            </div>
                        </div>
                    </div>
                    <div className="ig-grid-placeholder">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(i => <div key={i} className="ig-grid-item">📸</div>)}
                    </div>
                    <div className="ig-see-full-cta">
                        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '1rem' }}>See the actual profile live?</p>
                        <a href={url} target="_blank" rel="noreferrer" className="premium-action-btn" style={{ background: 'var(--instagram-gradient)', border: 'none' }}>
                            Open in App
                        </a>
                    </div>
                </div>
            );
        }

        // Default Fallback for other platforms
        return (
            <div className="iframe-fallback-overlay">
                <div className="fallback-card">
                    <div className="fallback-security-badge">
                        <div className="security-icon-wrapper">🛡️</div>
                        <span>Security Verified Preview</span>
                    </div>
                    <div className="fallback-body">
                        <div className="platform-branding-large">
                            <span className="platform-emoji-large">{getPlatformEmoji(platform)}</span>
                            <h4>{platform} Protected Profile</h4>
                        </div>
                        <p className="fallback-explanation">
                            This platform restricts embedded views. You can securely view the profile in a new window.
                        </p>
                        <div className="fallback-actions">
                            <a href={url} target="_blank" rel="noreferrer" className="premium-action-btn">
                                Open {platform} Profile
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`saas-layout ${stage === STAGES.ENTRY ? 'stage-entry' : ''}`} style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: stage === STAGES.ENTRY ? 'hidden' : 'auto' }}>
            {/* Top Navigation: Professional SaaS Header */}
            <nav className="navbar">
                <div className="nav-left">
                    {stage !== STAGES.ENTRY && (
                        <button className="nav-back-btn" onClick={handleGoBack} title="Go Back">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="nav-center">
                    <div className="nav-logo" onClick={handleReset} style={{ cursor: 'pointer' }}>
                        <img src="/logo.png" alt="LookUp Logo" />
                    </div>
                </div>

                <div className="nav-right">
                    <div className="nav-actions">
                        <button className="nav-btn secondary desktop-only">Support</button>
                        {user ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span style={{ color: 'var(--text-main)', fontSize: '0.9rem', fontWeight: '600' }}>
                                    Hi, {user.name.split(' ')[0]}
                                </span>
                                <button className="nav-btn primary" onClick={logout}>Account</button>
                            </div>
                        ) : (
                            <button className="nav-btn primary" onClick={() => setIsAuthModalOpen(true)}>Log In / Sign Up</button>
                        )}
                    </div>
                </div>
            </nav>

            {/* Global Loading Overlay */}
            {(stage === STAGES.IDENTIFYING || stage === STAGES.DEEP_LOADING) && (
                <LoadingChecklist
                    stage={stage}
                    STAGES={STAGES}
                    progress={loadProgress}
                    currentStep={currentStep}
                    onCancel={handleCancel}
                    query={query}
                    personaName={data?.personaName}
                />
            )}

            <main className="container">
                {/* 1. Home View (Hero Focus) */}
                {stage === STAGES.ENTRY && (
                    <div className="home-view">
                        <div className="hero-box">
                            <div className={`hero-search-container animate-fade-up ${searchMode === SEARCH_MODES.PHONE ? 'phone-mode' : ''}`}>
                                <div className="mode-switcher">
                                    <button 
                                        className={`mode-btn ${searchMode === SEARCH_MODES.GENERAL ? 'active' : ''}`}
                                        onClick={() => setSearchMode(SEARCH_MODES.GENERAL)}
                                        title="Identity Search"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="11" cy="11" r="8"></circle>
                                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                        </svg>
                                    </button>
                                    <button 
                                        className={`mode-btn ${searchMode === SEARCH_MODES.PHONE ? 'active' : ''}`}
                                        onClick={() => setSearchMode(SEARCH_MODES.PHONE)}
                                        title="Phone Intelligence"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="5" y="2" width="14" height="20" rx="3" ry="3"></rect>
                                            <path d="M12 18h.01"></path>
                                        </svg>
                                    </button>
                                </div>

                                {searchMode === SEARCH_MODES.PHONE && (
                                    <>
                                        <div className="country-selector-pill" ref={countryDropdownRef}>
                                            <div className="phone-prefix-v2" onClick={() => setShowCountryDropdown(!showCountryDropdown)}>
                                                <span className="flag">{selectedCountry.flag}</span>
                                                <span className="prefix">{selectedCountry.prefix}</span>
                                                <svg className={`chevron ${showCountryDropdown ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </div>
                                            {showCountryDropdown && (
                                                <div className="country-dropdown-v2">
                                                    {COUNTRIES.map((c) => (
                                                        <div key={c.code} className="country-option-v2" onClick={() => { 
                                                            setSelectedCountry(c); 
                                                            setShowCountryDropdown(false); 
                                                            setManualCountry(true);
                                                        }}>
                                                            <span className="option-flag">{c.flag}</span>
                                                            <span className="option-name">{c.name}</span>
                                                            <span className="option-prefix">{c.prefix}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="search-divider"></div>
                                    </>
                                )}

                                <input
                                    className="hero-search-input"
                                    type={searchMode === SEARCH_MODES.PHONE ? "tel" : "text"}
                                    inputMode={searchMode === SEARCH_MODES.PHONE ? "numeric" : "text"}
                                    pattern={searchMode === SEARCH_MODES.PHONE ? "[0-9]*" : undefined}
                                    placeholder={searchMode === SEARCH_MODES.PHONE ? "Enter mobile number..." : "Enter name, email, or digital identity..."}
                                    value={query}
                                    maxLength={30}
                                    onChange={(e) => {
                                        if (searchMode === SEARCH_MODES.PHONE) {
                                            setQuery(e.target.value.replace(/\D/g, ''));
                                        } else {
                                            setQuery(e.target.value);
                                        }
                                    }}
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

                            {/* Mobile-only content to fill blank space */}
                            <div className="mobile-home-extras animate-fade-up">
                                <div className="mobile-stats-row">
                                    <div className="mobile-stat-chip">
                                        <span className="stat-icon">🧠</span>
                                        <div>
                                            <div className="stat-num">10M+</div>
                                            <div className="stat-label">Records</div>
                                        </div>
                                    </div>
                                    <div className="mobile-stat-chip">
                                        <span className="stat-icon">⚡</span>
                                        <div>
                                            <div className="stat-num">&lt;2s</div>
                                            <div className="stat-label">Results</div>
                                        </div>
                                    </div>
                                    <div className="mobile-stat-chip">
                                        <span className="stat-icon">🔒</span>
                                        <div>
                                            <div className="stat-num">100%</div>
                                            <div className="stat-label">Private</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mobile-feature-list">
                                    <div className="mobile-feature-item">
                                        <div className="mf-icon">🌐</div>
                                        <div className="mf-text">
                                            <div className="mf-title">Cross-Platform Search</div>
                                            <div className="mf-desc">Search across CSV, SQL & online sources simultaneously</div>
                                        </div>
                                    </div>
                                    <div className="mobile-feature-item">
                                        <div className="mf-icon">📱</div>
                                        <div className="mf-text">
                                            <div className="mf-title">Phone Intelligence</div>
                                            <div className="mf-desc">Identify owners from any number worldwide</div>
                                        </div>
                                    </div>
                                    <div className="mobile-feature-item">
                                        <div className="mf-icon">🎯</div>
                                        <div className="mf-text">
                                            <div className="mf-title">AI-Powered Accuracy</div>
                                            <div className="mf-desc">Smart deduplication and confidence scoring</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. Selecting View (Structured Candidates) */}
                {(stage === STAGES.SELECTING) && (
                    <div className="selecting-view animate-fade-up">
                        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>
                                    Potential Intel Matches
                                </h2>
                                <p style={{ color: 'var(--text-soft)', margin: '0.5rem 0 0' }}>
                                    Select the correct identity to trigger deep intelligence acquisition.
                                </p>
                            </div>
                        </div>

                        <div className="candidates-grid">
                            {candidates.map((person, idx) => (
                                <div 
                                    key={person.id} 
                                    className="saas-card animate-scale-in" 
                                    style={{ cursor: 'pointer', border: stage === STAGES.CONFIRMING ? '2px solid var(--accent)' : '1px solid var(--border-light)' }}
                                >
                                    <div className="card-icon" style={{ marginTop: '0.25rem' }}>👤</div>
                                    <div className="card-body">
                                        <div className="card-meta">
                                            {person.source === 'local' ? 'Verified Archive' : `Source: ${person.source}`}
                                        </div>
                                        <h3 className="card-title">{person.name}</h3>
                                        <p className="card-desc" style={{ fontSize: '0.9rem', color: 'var(--text-main)', opacity: 0.9 }}>
                                            {person.description}
                                        </p>
                                        
                                        <div className="card-actions-row" style={{ marginTop: '1.25rem' }}>
                                            <button 
                                                className="nav-btn primary" 
                                                style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', width: '100%', background: 'var(--accent)' }}
                                                onClick={() => handleCandidateSelect(person)}
                                            >
                                                Select and Initialize Deep Search
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {stage === STAGES.SELECTING && (
                            <div className="animate-fade-up" style={{ marginTop: '3rem', textAlign: 'center' }}>
                                <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Don't see who you're looking for?</p>
                                <button className="nav-btn secondary" onClick={() => {
                                    setFeedbackData({ name: query, keyword: '', number: '' });
                                    setShowFeedbackForm(true);
                                }} style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}>
                                    Person Not Found
                                </button>
                            </div>
                        )}
                    </div>
                )}

            </main>

            {/* 3. Dashboard View — Full-Width (outside .container) */}
            {stage === STAGES.DASHBOARD && deepData && (
                <div className="dashboard-container">

                    <div className="results-container">
                        {/* Profile Summary Card */}
                        <section className="profile-hero animate-fade-up">
                            <div className="profile-hero-content">
                                <div className="profile-avatar-container">
                                    <img
                                        src={deepData.person.primaryImageObj?.isBlocked ? deepData.person.primaryImageObj.thumbnail : (deepData.person.primaryImage || "https://ui-avatars.com/api/?name=" + encodeURIComponent(deepData.person.name) + "&background=0D8ABC&color=fff")}
                                        alt={deepData.person.name}
                                        className="profile-avatar"
                                        onError={(e) => {
                                            // Fallback chain: original -> thumbnail -> ui-avatar
                                            if (e.target.src !== deepData.person.primaryImageObj?.thumbnail && deepData.person.primaryImageObj?.thumbnail) {
                                                e.target.src = deepData.person.primaryImageObj.thumbnail;
                                            } else {
                                                e.target.src = "https://ui-avatars.com/api/?name=" + encodeURIComponent(deepData.person.name) + "&background=0D8ABC&color=fff";
                                            }
                                        }}
                                    />
                                    <div className="avatar-status-ring"></div>
                                </div>
                                <div className="profile-info">
                                    <div className="profile-tags">
                                        {deepData.person.location && <span className="location-pill">📍 {deepData.person.location}</span>}
                                    </div>
                                    <h1 className="profile-name">{deepData.person.name}</h1>

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
                                            <div key={i} className="social-pill-link" style={{ cursor: 'pointer' }} onClick={() => openPreview(social.url, social.platform, true)} title={social.platform}>
                                                <span className="platform-icon">{getPlatformEmoji(social.platform)}</span>
                                                <span className="platform-name">{social.platform}</span>
                                            </div>
                                        ))}
                                    </div>

                                </div>
                            </div>
                        </section>

                        {/* Intelligence Feed */}
                        <section className="results-feed">

                            {/* Contact Intelligence Dashboard */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">📇 Contact Intelligence Dashboard</h3>
                                    <span className="category-count">Verified Identity Pins</span>
                                </div>
                                <div className="social-grid">
                                    {(deepData.person.emails || []).map((email, i) => (
                                        <div key={`email-${i}`} className="saas-card animate-scale-in" style={{ cursor: 'pointer' }} onClick={() => toggleReveal(email)}>
                                            <div className="card-icon">✉️</div>
                                            <div className="card-body">
                                                <div className="card-meta">Enriched Email</div>
                                                <div className="card-title" style={{ fontSize: '0.9rem' }}>
                                                    {revealedNumbers.has(email) ? email : maskEmail(email)}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: '4px', opacity: 0.8 }}>
                                                    Source: {deepData.person.enrichmentRecord?.source || 'Public Identity Record'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(deepData.person.phoneNumbers || []).map((phone, i) => (
                                        <div key={`phone-${i}`} className="saas-card animate-scale-in" style={{ cursor: 'pointer' }} onClick={() => toggleReveal(phone)}>
                                            <div className="card-icon">📞</div>
                                            <div className="card-body">
                                                <div className="card-meta">Verified Phone</div>
                                                <div className="card-title" style={{ fontSize: '0.9rem' }}>
                                                    {revealedNumbers.has(phone) ? phone : maskPhone(phone)}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--accent)', marginTop: '4px', opacity: 0.8 }}>
                                                    Validated Result
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {(!deepData.person.emails?.length && !deepData.person.phoneNumbers?.length) && (
                                        <div className="empty-state">No direct contact data identified.</div>
                                    )}
                                </div>
                            </div>

                            {/* Media Verification */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">📷 Media Verification</h3>
                                    <span className="category-count">{deepData.images?.length || 0} Items</span>
                                </div>
                                {deepData.images && deepData.images.length > 0 ? (
                                    <div className="gallery-slider">
                                        {deepData.images.map((img, idx) => {
                                            const initials = deepData.person?.name ? deepData.person.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
                                            const displayUrl = img.isBlocked ? img.thumbnail : img.original;
                                            return (
                                                <div key={idx} className="gallery-item-wrapper" style={{ position: 'relative', width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', background: '#f1f5f9', flexShrink: 0 }}>
                                                    <img
                                                        src={displayUrl}
                                                        className="gallery-thumbnail"
                                                        alt="Evidence"
                                                        onClick={() => openPreview(img.original, 'Media')}
                                                        style={{ cursor: 'pointer', width: '100%', height: '100%', objectFit: 'cover' }}
                                                        onError={(e) => {
                                                            if (displayUrl !== img.thumbnail && img.thumbnail) {
                                                                e.target.src = img.thumbnail;
                                                            } else {
                                                                e.target.style.display = 'none';
                                                                e.target.parentElement.querySelector('.img-placeholder').style.display = 'flex';
                                                            }
                                                        }}
                                                    />
                                                    <div className="img-placeholder" style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%)', color: '#64748b', fontSize: '1.5rem', fontWeight: 800 }}>
                                                        {initials}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="empty-state">No media data available</div>
                                )}
                            </div>

                            {/* Platform Footprint */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">🌐 Platform Footprint</h3>
                                    <span className="category-count">{deepData.socials.length} Sources</span>
                                </div>
                                {deepData.socials.length > 0 ? (
                                    <div className="social-grid">
                                        {deepData.socials.map((social, i) => (
                                            <div key={i} className="saas-card animate-scale-in" style={{ cursor: 'pointer' }} onClick={() => openPreview(social.url, social.platform, true)}>
                                                <div className="card-icon">{getPlatformEmoji(social.platform)}</div>
                                                <div className="card-body">
                                                    <div className="card-meta">{social.platform}</div>
                                                    <div className="card-title" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{social.handle || social.url}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">No social media profiles found.</div>
                                )}
                            </div>

                            {/* External Documents & Evidence */}
                            {deepData.externalDocuments && deepData.externalDocuments.length > 0 && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">📄 External Documents & Evidence</h3>
                                        <span className="category-count">{deepData.externalDocuments.length} Findings</span>
                                    </div>
                                    <div className="social-grid">
                                        {(showAllDocuments ? deepData.externalDocuments : deepData.externalDocuments.slice(0, 6)).map((doc, i) => (
                                            <div key={i} className="saas-card animate-scale-in" style={{ cursor: 'pointer' }} onClick={() => window.open(doc.url, '_blank')}>
                                                <div className="card-icon">
                                                    {doc.platform === 'PDF' ? '📝' :
                                                        doc.platform === 'DOCX' ? '📄' :
                                                            doc.platform === 'PPT' ? '📊' : '📁'}
                                                </div>
                                                <div className="card-body">
                                                    <div className="card-meta">{doc.platform} Document</div>
                                                    <div className="card-title" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {doc.title || 'View Source'}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                                                        {doc.snippet.substring(0, 40)}...
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {deepData.externalDocuments.length > 6 && (
                                        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                                            <button 
                                                className="nav-btn secondary" 
                                                onClick={() => setShowAllDocuments(!showAllDocuments)}
                                                style={{ padding: '0.6rem 2rem', fontSize: '0.9rem' }}
                                            >
                                                {showAllDocuments ? "Show Less" : "More Information"}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* Internal Archive */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">🗄️ Internal Archive Dossiers</h3>
                                    <span className="category-count">{deepData.localData?.length || 0} Records</span>
                                </div>
                                {deepData.localData && deepData.localData.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        {deepData.localData.map((item, idx) => (
                                            <div key={idx} className="archive-card animate-scale-in">
                                                <div className="archive-card-header">
                                                    <span className={`source-badge ${item.source === 'SQLite' ? 'badge-sqlite' : (item.source === 'MongoDB' ? 'badge-mongodb' : 'badge-internet')}`}>
                                                        {item.source === 'local' ? 'CSV ARCHIVE' : (item.source === 'SQLite' ? 'SQLITE DATASTORE' : (item.source === 'MongoDB' ? 'CLUSTER DB' : (item.source || 'LOCAL').toUpperCase()))}
                                                    </span>
                                                    <span className="archive-card-id">ID: {item.id || `${idx + 1}-H1`}</span>
                                                </div>
                                                <p className="archive-card-text">{item.text}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="empty-state">No internal archive data available.</div>
                                )}
                            </div>

                            {/* AI Synthesis */}
                            {deepData.person.aiSummary && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">✨ AI Synthesis</h3>
                                    </div>
                                    <div className="ai-summary-block prose" style={{ padding: '1.5rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', borderLeft: 'none', color: 'var(--text-main)', lineHeight: '1.6', fontSize: '1rem' }}>
                                        <ReactMarkdown>{deepData.person.aiSummary}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            )}

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

            {/* Premium In-App Browser Modal */}
            {previewUrl && (
                <div className="modal-overlay" onClick={() => { setPreviewUrl(null); setPreviewIsSocial(false); setIsLiveView(false); }}>
                    <div className="preview-modal-minimal animate-scale-in" onClick={e => e.stopPropagation()}>

                        {/* Minimalist Header */}
                        <div className="modal-header-minimal">
                            <button className="minimal-back-btn" onClick={() => { setPreviewUrl(null); setPreviewIsSocial(false); setIsLiveView(false); }}>
                                ← Back
                            </button>
                        </div>

                        {/* Intelligence Container */}
                        <div className="modal-iframe-container" style={{ background: previewIsSocial && !isLiveView ? 'inherit' : '#fff' }}>
                            {(!previewIsSocial || isLiveView) ? (
                                previewIsSocial ? (
                                    <LivePreviewViewer
                                        url={previewUrl}
                                        onOpenOriginal={() => window.open(previewUrl, '_blank')}
                                    />
                                ) : (
                                    <iframe
                                        src={previewUrl}
                                        className="preview-iframe iframe-blend"
                                        title="Intelligence Preview"
                                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                                    />
                                )
                            ) : (
                                <div className="mirror-content-scrollable">
                                    {renderPlatformMirror(previewPlatform, previewUrl)}
                                </div>
                            )}
                        </div>

                        {/* Minimalist Footer */}
                        <div className="modal-footer-minimal">
                            <button className="minimal-open-original-btn" onClick={() => window.open(previewUrl, '_blank')}>
                                Open Original Page
                            </button>
                        </div>

                    </div>
                </div>
            )}

            {showFeedbackForm && (
                <div className="modal-overlay" onClick={() => setShowFeedbackForm(false)}>
                    <form className="precision-modal animate-scale-in" onSubmit={handleFeedbackSubmit} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Intelligence Fallback</h2>
                            <p style={{ color: 'var(--text-soft)', margin: 0, fontSize: '0.9rem' }}>Initial discovery failed. Please provide exact attributes.</p>
                        </div>

                        <div className="modal-tabs" style={{ display: 'flex', gap: '1rem', padding: '0 1.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                            <button 
                                type="button"
                                className={`tab-btn ${searchMode === SEARCH_MODES.GENERAL ? 'active' : ''}`}
                                onClick={() => setSearchMode(SEARCH_MODES.GENERAL)}
                                style={{ padding: '0.75rem 0', background: 'none', border: 'none', color: searchMode === SEARCH_MODES.GENERAL ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, borderBottom: searchMode === SEARCH_MODES.GENERAL ? '2px solid var(--accent)' : 'none', cursor: 'pointer' }}
                            >
                                Name Search
                            </button>
                            <button 
                                type="button"
                                className={`tab-btn ${searchMode === SEARCH_MODES.PHONE ? 'active' : ''}`}
                                onClick={() => setSearchMode(SEARCH_MODES.PHONE)}
                                style={{ padding: '0.75rem 0', background: 'none', border: 'none', color: searchMode === SEARCH_MODES.PHONE ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 700, borderBottom: searchMode === SEARCH_MODES.PHONE ? '2px solid var(--accent)' : 'none', cursor: 'pointer' }}
                            >
                                Number Search
                            </button>
                        </div>

                        <div className="modal-body">
                            {searchMode === SEARCH_MODES.GENERAL ? (
                                <div className="form-dense-group animate-fade-up">
                                    <div className="form-group">
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>NAME (REQUIRED)</label>
                                        <input
                                            className="hero-search-input"
                                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)' }}
                                            value={feedbackData.name}
                                            onChange={(e) => setFeedbackData({ ...feedbackData, name: e.target.value })}
                                            placeholder="Full legal name"
                                            required
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>KEYWORD (REQUIRED)</label>
                                        <input
                                            className="hero-search-input"
                                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)' }}
                                            value={feedbackData.keyword}
                                            onChange={(e) => setFeedbackData({ ...feedbackData, keyword: e.target.value })}
                                            placeholder="Company, Role, or Location"
                                            required
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="form-dense-group animate-fade-up">
                                    <div className="form-group">
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>PHONE NUMBER</label>
                                        <input
                                            className="hero-search-input"
                                            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)' }}
                                            value={feedbackData.number}
                                            onChange={(e) => setFeedbackData({ ...feedbackData, number: e.target.value })}
                                            placeholder="e.g. +1 234 567 8900"
                                            required
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="nav-btn secondary" onClick={() => setShowFeedbackForm(false)}>Cancel</button>
                            <button type="submit" className="nav-btn primary">
                                Start Intelligent Discovery
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
        </div>
    );
};

export default MultiSearchPage;
