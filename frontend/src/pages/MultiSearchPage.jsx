import { useEffect, useState, useRef, useCallback, useContext } from "react";
import "../index.css";
import LivePreviewViewer from "../components/LivePreviewViewer";
import AuthModal from "../components/AuthModal";
import { AuthContext } from "../context/AuthContext";
import ReactMarkdown from 'react-markdown';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';



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

const LoadingChecklist = ({ title, progress, currentStep, onCancel, query, personaName }) => {
    const loadingMessages = [
        "Initializing intelligence scan",
        "Querying distributed data nodes",
        "Analyzing digital footprint",
        "Cross-referencing identity signals",
        "Compiling final intel report"
    ];

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
                    <span className="pill-intel-label">INTEL CORE ACTIVE</span>
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
                            <span className="status-text">{loadingMessages[currentStep]}</span>
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

    // Auto-Country Detection & Auto-Switch to Phone Mode
    useEffect(() => {
        // If user is typing a query that looks like a phone number, optionally auto-switch modes or detect country
        const cleanQuery = query.replace(/\D/g, "");

        if (searchMode === SEARCH_MODES.PHONE) {
            if (query.startsWith('+')) {
                const matched = COUNTRIES.find(c => query.startsWith(c.prefix));
                if (matched && matched.code !== selectedCountry.code) {
                    setSelectedCountry(matched);
                }
            } else if (cleanQuery.length >= 10) {
                // If no plus, try to guess based on length and starting digit
                if (cleanQuery.length === 10) {
                    const firstDigit = cleanQuery.charAt(0);
                    // Indian numbers typically start with 6, 7, 8, 9
                    if (['6', '7', '8', '9'].includes(firstDigit)) {
                        const india = COUNTRIES.find(c => c.code === 'IN');
                        if (india && selectedCountry.code !== 'IN') setSelectedCountry(india);
                    } else {
                        // Otherwise default guess to US for 10 digit
                        const us = COUNTRIES.find(c => c.code === 'US');
                        if (us && selectedCountry.code !== 'US') setSelectedCountry(us);
                    }
                }
            }
        } else if (searchMode === SEARCH_MODES.GENERAL) {
            // Auto switch to phone mode if they type a plus followed by numbers
            if (query.startsWith('+') && query.length > 1 && /^\+\d+$/.test(query.replace(/\s/g, ''))) {
                setSearchMode(SEARCH_MODES.PHONE);
            }
        }
    }, [query, searchMode, COUNTRIES, selectedCountry]);

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

    // Unified Progress & Step Logic
    useEffect(() => {
        let interval;
        if (stage === STAGES.IDENTIFYING || stage === STAGES.DEEP_LOADING) {
            interval = setInterval(() => {
                setLoadProgress(prev => {
                    // Asymptotic Trickle Logic:
                    // Never hits a hard ceiling. As it approaches the target (48 or 98), 
                    // the increment gets smaller and smaller, showing the app is still active.
                    const target = stage === STAGES.IDENTIFYING ? 48.5 : 99.2;
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

                // 1. Same source + Same name = Likely same record
                if (itemSource === groupSource && groupName === name) return true;

                // 2. Cross-source matching via identifiers (Stronger Anchor)
                const itemPhones = item.phoneNumbers || (item.phone ? [item.phone] : []);
                const groupPhones = group.phoneNumbers || [];
                const itemEmails = item.email ? [item.email.toLowerCase()] : (item.emails || []);
                const groupEmails = group.emails || [];

                if (itemPhones.some(p => groupPhones.includes(p))) return true;
                if (itemEmails.some(e => groupEmails.includes(e.toLowerCase()))) return true;

                return false;
            });

            if (matchedGroup) {
                // Merge unique identifiers (CRITICAL for Deep Search accuracy)
                if (item.phoneNumbers) {
                    item.phoneNumbers.forEach(p => {
                        if (!matchedGroup.phoneNumbers.includes(p)) matchedGroup.phoneNumbers.push(p);
                    });
                }
                if (item.emails) {
                    item.emails.forEach(e => {
                        if (!matchedGroup.emails.includes(e)) matchedGroup.emails.push(e);
                    });
                }
                if (item.email && !matchedGroup.emails.includes(item.email)) {
                    matchedGroup.emails.push(item.email);
                }

                // Merge unique descriptions into a single standard string
                if (item.description && item.description !== 'No description available') {
                    // Standardize: remove redundant "SBMP" or other AI suffixes from sub-descriptions
                    const cleanDesc = item.description.split(' - ')[0].trim();
                    if (!matchedGroup.descriptions.includes(cleanDesc)) {
                        matchedGroup.descriptions.push(cleanDesc);
                    }
                }

                // Construct a single primary description
                matchedGroup.richDescription = matchedGroup.descriptions.slice(0, 2).join(" | ");

                // Merge unique sources
                const itemSource = item.source || "Unknown";
                if (!matchedGroup.sources.includes(itemSource)) {
                    matchedGroup.sources.push(itemSource);
                }

                // Keep the "Verified" local record's ID/metadata as primary
                if (item.source === "local") {
                    matchedGroup.id = item.id || matchedGroup.id;
                    matchedGroup.source = "local";
                    matchedGroup.metadata = item.metadata || matchedGroup.metadata;
                }
            } else {
                let sourceLabel = item.source || "Unknown";
                if (sourceLabel.toLowerCase() === 'local') sourceLabel = 'CSV Archive';
                if (sourceLabel.toLowerCase() === 'sqlite') sourceLabel = 'Identity SQL';
                if (sourceLabel.toLowerCase() === 'mongodb') sourceLabel = 'Cluster DB';

                const descriptions = (item.description && item.description !== 'No description available') ? [item.description] : [];

                groups.push({
                    ...item,
                    phoneNumbers: item.phoneNumbers || (item.phone ? [item.phone] : []),
                    emails: item.email ? [item.email.toLowerCase()] : (item.emails || []),
                    descriptions: descriptions,
                    richDescription: descriptions.slice(0, 2).join(" | "),
                    sources: [sourceLabel]
                });
            }
        });
        return groups;
    };

    const cancelSearch = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            console.log("[Search] Cancellation Signal Sent");
        }
    };

    const handleIdentify = async (precisionData = null) => {
        // Cancel any pending search first
        cancelSearch();
        abortControllerRef.current = new AbortController();

        // Ensure precisionData is actually a data object, not a React Event
        const isData = precisionData && typeof precisionData === 'object' && !precisionData.nativeEvent;
        const searchData = isData ? precisionData : null;

        const searchName = searchData ? searchData.name : query;
        if (!searchName || typeof searchName !== 'string' || !searchName.trim()) return;

        // B-003: Reset stale metadata instantly
        setData(null);
        setCandidates([]);
        setLoadProgress(10); // Start progress immediately at 10%

        setStage(STAGES.IDENTIFYING);

        // F-002: Normalize search query
        let finalSearchName = searchName;
        if (searchMode === SEARCH_MODES.PHONE) {
            const cleanNumber = searchName.replace(/\+/g, "").replace(/\D/g, "");
            // If it doesn't start with +, prepend the selected prefix
            if (!searchName.startsWith("+")) {
                finalSearchName = `${selectedCountry.prefix}${cleanNumber}`;
            }
        }

        // id: 12 - Sync global query so progress bar shows the LATEST name/number
        setQuery(finalSearchName);
        const finalQuery = finalSearchName;

        const VITE_API_URL = API_URL || "http://localhost:5000";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s fail-safe

        try {
            const res = await fetch(`${VITE_API_URL}/api/multi-search/identify`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: finalQuery,
                    keywords: precisionData?.keyword || "",
                    number: precisionData?.number || ""
                }),
                signal: abortControllerRef.current?.signal
            });
            clearTimeout(timeoutId);

            // B-002: If it's a phone search, try to find the name early for the progress bar
            if (searchMode === SEARCH_MODES.PHONE) {
                // We'll set a temporary "Resolving..." but if the API returns directResolve, it will update
                setData({ personaName: "Resolving identity..." });
            }

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
                setLoadProgress(50); // Jump to 50% when candidates are found
                setStage(STAGES.SELECTING);
            } else {
                console.log("[Search] No candidates found. Triggering Precision Search.");
                setStage(STAGES.ENTRY);
                setShowFeedbackForm(true);
            }
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                console.error("Identification timed out after 45s");
                alert("The search is taking longer than expected. Please try again with more specific keywords.");
            } else {
                console.error("Identification failed:", err);
                alert("Search service is currently unreachable. If you are using the deployed version, please ensure the backend is active and the API URL is configured correctly.");
            }
            setLoadProgress(0);
            setStage(STAGES.ENTRY);
        }
    };

    const handleCandidateSelect = async (candidate) => {
        setStage(STAGES.DEEP_LOADING);
        setLoadProgress(60); // Start deep search at 60%
        setData(prev => ({ ...prev, personaName: candidate.name })); // Ensure name shows in loader
        const VITE_API_URL = API_URL || "http://localhost:5000";
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s fail-safe

        try {
            const res = await fetch(`${VITE_API_URL}/api/multi-search/deep`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ person: candidate }),
                signal: abortControllerRef.current?.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`Deep Search failed with status ${res.status}`);

            const result = await res.json();
            setDeepData(result);
            setLoadProgress(100); // Complete!
            setStage(STAGES.DASHBOARD);

            const updated = [candidate.name, ...recent.filter(r => r !== candidate.name)].slice(0, 5);
            setRecent(updated);
            localStorage.setItem("recent-searches", JSON.stringify(updated));
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                console.error("Deep search timed out after 45s");
                alert("Deep intelligence gathering is taking too long. Please try again later.");
            } else {
                console.error("Deep Search failed:", err);
                alert("Failed to retrieve deep search details. Please check your connection.");
            }
            setLoadProgress(0);
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
                                <button className="nav-btn primary" onClick={logout}>Log Out</button>
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
                    title={stage === STAGES.IDENTIFYING ? "Initial identification..." : "Deep intelligence dive..."}
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
                                <div className="search-icon-left" style={{ padding: '0 12px', color: 'var(--text-muted)' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8"></circle>
                                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    </svg>
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
                                    inputMode={searchMode === SEARCH_MODES.PHONE ? "numeric" : "text"}
                                    pattern={searchMode === SEARCH_MODES.PHONE ? "[0-9]*" : undefined}
                                    placeholder={searchMode === SEARCH_MODES.PHONE ? "Enter mobile number..." : "Enter name, email, or digital identity..."}
                                    value={query}
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
                                <button
                                    className={`keypad-toggle-btn ${searchMode === SEARCH_MODES.PHONE ? 'active' : ''}`}
                                    onClick={() => setSearchMode(prev => prev === SEARCH_MODES.GENERAL ? SEARCH_MODES.PHONE : SEARCH_MODES.GENERAL)}
                                    title="Search by Phone Number"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        padding: '8px',
                                        marginRight: '8px',
                                        color: searchMode === SEARCH_MODES.PHONE ? 'var(--accent)' : 'var(--text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 'var(--radius-md)',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="4" y="2" width="16" height="20" rx="3"></rect>
                                        <path d="M8 7h.01"></path>
                                        <path d="M12 7h.01"></path>
                                        <path d="M16 7h.01"></path>
                                        <path d="M8 12h.01"></path>
                                        <path d="M12 12h.01"></path>
                                        <path d="M16 12h.01"></path>
                                        <path d="M8 17h.01"></path>
                                        <path d="M12 17h.01"></path>
                                        <path d="M16 17h.01"></path>
                                    </svg>
                                </button>
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
                {stage === STAGES.SELECTING && (
                    <div className="selecting-view">
                        <div className="animate-fade-up" style={{ marginBottom: '2rem' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Potential intel matches</h2>
                        </div>
                        <div className="candidates-grid">
                            {candidates.map((person, idx) => (
                                <div key={idx} ref={el => { cardRefs.current[idx] = el; }} className={`saas-card animate-scale-in ${expandedCards.has(idx) ? 'expanded' : ''}`} onClick={() => handleCandidateSelect(person)} style={{ cursor: 'pointer' }}>
                                    <div className="card-icon" style={{ marginTop: '0.25rem' }}>👤</div>
                                    <div className="card-body">
                                        <div className="card-meta">
                                            {person.confidence === 'high' ? 'High Accuracy' : 'Identity Probable'}
                                            {person.source === 'local' && <span className="verified-badge">✓ Verified</span>}
                                        </div>
                                        <h3 className="card-title">{(person.name || "").split(' - ')[0]}</h3>

                                        <p className="card-desc">
                                            {person.richDescription || person.description || "Intelligence Synthesis Target"}
                                        </p>

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
                                                    <span key={i} className="card-desc" style={{ fontSize: '0.7rem', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: '12px', opacity: 1, color: 'var(--accent)', fontWeight: 600 }}>
                                                        📍 {src}
                                                    </span>
                                                ))}
                                                {!person.sources && person.location && <p className="card-desc" style={{ fontSize: '0.8rem', opacity: 0.8 }}>📍 {person.location}</p>}
                                            </div>
                                        </div>

                                        {overflowingCards.has(idx) && (
                                            <span
                                                className="card-read-more-text"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedCards(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(idx)) next.delete(idx);
                                                        else next.add(idx);
                                                        return next;
                                                    });
                                                }}
                                            >
                                                {expandedCards.has(idx) ? 'Show less' : 'Read more'}
                                            </span>
                                        )}
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

                            {/* Media Verification */}
                            <div className="category-section animate-fade-up">
                                <div className="category-header">
                                    <h3 className="category-title">📷 Media Verification</h3>
                                    <span className="category-count">{deepData.images?.length || 0} Items</span>
                                </div>
                                {deepData.images && deepData.images.length > 0 ? (
                                    <div className="gallery-slider">
                                        {deepData.images.map((img, idx) => {
                                            const initials = person.name ? person.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
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
                                                            // If original failed and we weren't already using thumbnail, try thumbnail
                                                            if (displayUrl !== img.thumbnail && img.thumbnail) {
                                                                e.target.src = img.thumbnail;
                                                            } else {
                                                                // Show placeholder if all fails
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
                            {deepData.socials.length > 0 && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">🌐 Platform Footprint</h3>
                                        <span className="category-count">{deepData.socials.length} Sources</span>
                                    </div>
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
                                </div>
                            )}
                            {deepData.socials.length === 0 && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">🌐 Platform Footprint</h3>
                                        <span className="category-count">0 Sources</span>
                                    </div>
                                    <div className="empty-state">No social media profiles found.</div>
                                </div>
                            )}

                            {/* External Documents & Evidence */}
                            {deepData.externalDocuments && deepData.externalDocuments.length > 0 && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">📄 External Documents & Evidence</h3>
                                        <span className="category-count">{deepData.externalDocuments.length} Findings</span>
                                    </div>
                                    <div className="social-grid">
                                        {deepData.externalDocuments.map((doc, i) => (
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
                                </div>
                            )}

                            {/* Internal Archive */}
                            {deepData.localData && deepData.localData.length > 0 && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">🗄️ Internal Archive Dossiers</h3>
                                        <span className="category-count">{deepData.localData.length} Records</span>
                                    </div>
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
                                </div>
                            )}
                            {(!deepData.localData || deepData.localData.length === 0) && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">🗄️ Internal Archive Dossiers</h3>
                                        <span className="category-count">0 Records</span>
                                    </div>
                                    <div className="empty-state">No internal archive data available.</div>
                                </div>
                            )}

                            {/* AI Synthesis */}
                            {deepData.person.aiSummary && (
                                <div className="category-section animate-fade-up">
                                    <div className="category-header">
                                        <h3 className="category-title">✨ AI Synthesis</h3>
                                    </div>
                                    <div className="ai-summary-block prose" style={{ padding: '1.5rem', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent)', color: 'var(--text-main)', lineHeight: '1.6', fontSize: '1rem' }}>
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
                    <form className="precision-modal" onSubmit={handleFeedbackSubmit} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>Precision Search</h2>
                            <p style={{ color: 'var(--text-soft)', margin: 0, fontSize: '0.9rem' }}>Provide additional attributes to improve target identification.</p>
                        </div>

                        <div className="modal-body">
                            <div className="form-dense-group">
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>NAME</label>
                                    <input
                                        className="hero-search-input"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)' }}
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
                                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)' }}
                                        value={feedbackData.keyword}
                                        onChange={(e) => setFeedbackData({ ...feedbackData, keyword: e.target.value })}
                                        placeholder="e.g. Student at MIT"
                                    />
                                </div>
                                <div className="form-group">
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-soft)' }}>NUMBER (LOCAL ONLY)</label>
                                    <input
                                        className="hero-search-input"
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)', padding: '0.75rem 1rem', fontSize: '1rem', width: '100%', boxSizing: 'border-box', color: 'var(--primary)' }}
                                        value={feedbackData.number}
                                        onChange={(e) => setFeedbackData({ ...feedbackData, number: e.target.value.replace(/\D/g, '') })}
                                        placeholder="e.g. 91xxxxxxxxxx"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button type="button" className="nav-btn secondary" onClick={() => setShowFeedbackForm(false)}>Cancel Search</button>
                            <button type="submit" className="nav-btn primary" disabled={savingFeedback}>
                                {savingFeedback ? "Searching..." : "Search Person"}
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
