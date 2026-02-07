import { useEffect, useState } from "react";
import "../index.css";

const API_URL = import.meta.env.VITE_API_URL;

const MultiSearchPage = () => {
  const [query, setQuery] = useState(() => localStorage.getItem("search-query") || "");
  const [data, setData] = useState(() => JSON.parse(localStorage.getItem("search-data")) || null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [isSearchingDeep, setIsSearchingDeep] = useState(false); // New
  const [recent, setRecent] = useState([]);
  const [hasSearched, setHasSearched] = useState(() => localStorage.getItem("has-searched") === "true");
  const [internetLoaded, setInternetLoaded] = useState(false);
  const [showNotFound, setShowNotFound] = useState(false); // Strict flow state

  // Stage 2 State
  const [deepData, setDeepData] = useState(null);

  // Feedback Form State
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackData, setFeedbackData] = useState({ name: "", keyword: "", location: "" });
  const [savingFeedback, setSavingFeedback] = useState(false);

  useEffect(() => {
    if (data) {
      console.log("FULL DATA:", data);
    }
  }, [data]);

  // Load recent searches on refresh
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("recent-searches")) || [];
    setRecent(saved);
  }, []);

  // Persist search state on change
  useEffect(() => {
    localStorage.setItem("search-query", query);
    localStorage.setItem("search-data", JSON.stringify(data));
    localStorage.setItem("has-searched", hasSearched);
    localStorage.setItem("search-candidates", JSON.stringify(candidates));
    localStorage.setItem("search-deepdata", JSON.stringify(deepData));
    localStorage.setItem("search-notfound", showNotFound);
  }, [query, data, hasSearched, candidates, deepData, showNotFound]);

  const getRelevanceLabel = (score = 0) => {
    if (score >= 40) return "High relevance";
    if (score >= 20) return "Medium relevance";
    return "Low relevance";
  };

  const handleIdentify = async () => {
    if (!query.trim()) return;

    try {
      setIsIdentifying(true);
      setCandidates([]);
      setData(null);
      setDeepData(null);
      setShowNotFound(false);
      setHasSearched(true);

      const res = await fetch(`${API_URL}/api/multi-search/identify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: query }),
      });

      const result = await res.json();

      // Strict Flow: Always show candidates list
      let foundCandidates = Array.isArray(result) ? result : [];

      if (foundCandidates.length === 0) {
        // Fallback: Create a manual option so the user MUST select it
        foundCandidates.push({
          name: query,
          description: "Click to perform a standard web & database search.",
          location: "Deep Search",
          confidence: "manual" // Changed to 'manual' to trigger standard search
        });
      }

      setCandidates(foundCandidates);
    } catch (err) {
      console.error("Identification failed:", err);
      // Even on error, try broad search
      await search(query, true);
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleCandidateSelect = async (candidate) => {
    try {
      setCandidates([]);
      setShowNotFound(false); // Clear not found state
      setHasSearched(true);
      setQuery(candidate.name);

      // FIX: If this is a manual fallback, do a STANDARD SEARCH (Grid Results)
      // instead of a Deep Profile Search (which might be empty).
      if (candidate.confidence === 'manual' || candidate.location === 'Deep Search') {
        console.log("Manual fallback selected -> Triggering standard search");
        await search(candidate.name, true);
        return;
      }

      // STRICT DEEP SEARCH FOR VERIFIED PROFILES
      setIsSearchingDeep(true);
      setDeepData(null);
      setData(null);

      const res = await fetch(`${API_URL}/api/multi-search/deep`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ person: candidate }),
      });

      const result = await res.json();
      setDeepData(result);

      const updated = [
        candidate.name,
        ...recent.filter(r => r !== candidate.name)
      ].slice(0, 5);
      setRecent(updated);
      localStorage.setItem("recent-searches", JSON.stringify(updated));

    } catch (err) {
      console.error("DeepSearch failed:", err);
    } finally {
      setIsSearchingDeep(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackData.name || !feedbackData.keyword) return;

    try {
      setSavingFeedback(true);
      const res = await fetch(`${API_URL}/api/multi-search/forminfo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(feedbackData),
      });

      if (res.ok) {
        setShowFeedbackForm(false);
        setShowNotFound(false);
        // Direct Deep Search using the provided details
        const syntheticCandidate = {
          name: feedbackData.name,
          description: feedbackData.keyword,
          location: feedbackData.location || "",
          confidence: "manual"
        };
        handleCandidateSelect(syntheticCandidate);
      }
    } catch (err) {
      console.error("Feedback submission failed:", err);
    } finally {
      setSavingFeedback(false);
    }
  };

  const search = async (searchQuery = query, includeInternet = false) => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setQuery(searchQuery);
      setHasSearched(true);
      if (!includeInternet) {
        setInternetLoaded(false);
      }
      const res = await fetch(`${API_URL}/api/multi-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: searchQuery, includeInternet }),
      });

      const result = await res.json();
      setData(result);
      if (includeInternet) {
        setInternetLoaded(true);
      }

      const updated = [
        searchQuery,
        ...recent.filter(r => r !== searchQuery)
      ].slice(0, 5);

      setRecent(updated);
      localStorage.setItem("recent-searches", JSON.stringify(updated));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setQuery("");
    setData(null);
    setDeepData(null);
    setCandidates([]);
    setShowNotFound(false);
    setHasSearched(false);
    setInternetLoaded(false);
    localStorage.removeItem("search-query");
    localStorage.removeItem("search-data");
    localStorage.removeItem("has-searched");
    localStorage.removeItem("search-candidates");
    localStorage.removeItem("search-deepdata");
    localStorage.removeItem("search-notfound");
  };

  return (
    <div className="nexa-search-page">
      {/* Golden Header */}
      <div className="nexa-header">
        <div className="nexa-header-content">
          <h1 className="nexa-title">NexaSearch</h1>
        </div>
      </div>

      {/* Search Bar */}
      <div className="nexa-search-container">
        <div className="nexa-search-bar">
          {hasSearched && (
            <button className="nexa-back-btn" onClick={handleReset} title="Reset Research">
              ← Back
            </button>
          )}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleIdentify()}
            placeholder="Search for a person..."
            className="nexa-search-input"
          />
          <button
            className="nexa-search-btn"
            onClick={handleIdentify}
            disabled={loading || isIdentifying}
          >
            {loading || isIdentifying ? 'Searching...' : 'SEARCH'}
          </button>
        </div>
      </div>

      {(loading || isIdentifying || isSearchingDeep) && (
        <div className="research-status" style={{ justifyContent: 'center', marginTop: '1rem', color: '#00d9ff' }}>
          <div className="pulse-dot"></div>
          {isIdentifying ? "Identifying possible matches..." :
            isSearchingDeep ? "Performing DeepSearch on selected profile..." :
              "Searching local databases and social profiles..."}
        </div>
      )}

      {/* Recent Searches - Horizontal */}
      {recent.length > 0 && !hasSearched && (
        <div className="nexa-recent-searches">
          <h3>Recent Searches</h3>
          <div className="nexa-recent-horizontal">
            {recent.slice(0, 3).map((item, idx) => (
              <div
                key={idx}
                className="nexa-recent-chip"
                onClick={() => search(item, true)}
              >
                <button
                  className="nexa-chip-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    const filtered = recent.filter(r => r !== item);
                    setRecent(filtered);
                    localStorage.setItem("recent-searches", JSON.stringify(filtered));
                  }}
                  title="Delete search"
                >
                  ×
                </button>
                <span className="nexa-chip-name">{item}</span>
                <span className="nexa-chip-time">
                  {new Date().toLocaleDateString()}
                </span>
              </div>
            ))}
            {recent.length > 3 && (
              <button className="nexa-more-btn">...</button>
            )}
          </div>
        </div>
      )}

      {/* CANDIDATES LIST (STAGE 1) */}
      {(candidates.length > 0 || showNotFound) && (
        <div className="results-wrapper">
          <div className="candidates-section">
            <h2 className="section-title">{candidates.length > 0 ? "Who are you looking for?" : "Person Not Found in Initial List"}</h2>
            <p className="section-subtitle">
              {candidates.length > 0
                ? "Select a person to see detailed social research"
                : "We couldn't identify the specific person you are looking for."}
            </p>

            {candidates.length > 0 && (
              <div className="candidates-grid">
                {candidates.map((person, idx) => (
                  <div
                    key={idx}
                    className="candidate-card"
                    onClick={() => handleCandidateSelect(person)}
                  >
                    <div className="candidate-info">
                      <h3>{person.name}</h3>
                      <p className="candidate-desc">{person.description}</p>
                      {person.location && <p className="candidate-loc">📍 {person.location}</p>}
                    </div>
                    <div className={`candidate-confidence ${person.confidence}`}>
                      {person.confidence} confidence
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="candidate-actions">
              <button className="person-not-found-btn" onClick={() => {
                setFeedbackData({ ...feedbackData, name: query });
                setShowFeedbackForm(true);
              }}>
                {candidates.length > 0 ? "Person not Found?" : "Provide Details for Search"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deepData ? (
        /* DEEP SEARCH RESULTS (STAGE 2 - FULL PAGE) */
        <div className="results-wrapper deep-results">
          <button className="close-deep-btn" onClick={() => setDeepData(null)}>← Back to List</button>

          <div className="deep-profile-header">
            <div className="deep-photo-main">
              {deepData.photo ? (
                <img src={deepData.photo} alt={deepData.person.name} referrerPolicy="no-referrer" />
              ) : (
                <div className="no-photo">No Image Found</div>
              )}
            </div>
            <div className="deep-profile-details">
              <h2>{deepData.person.name}</h2>
              <p className="deep-profession">{deepData.person.description}</p>
              {deepData.person.location && <p className="deep-location">📍 {deepData.person.location}</p>}

              <div className="deep-socials-row">
                {deepData.socials.length > 0 ? (
                  deepData.socials.map((soc, i) => {
                    const provider = (soc.platform || soc.provider || "generic").toLowerCase();
                    return (
                      <a key={i} href={soc.url} target="_blank" rel="noreferrer" className={`soc-link ${provider}`} title={provider}>
                        <span className={`social-icon ${provider}`}></span>
                        <span className="soc-label">{soc.username || "Profile"}</span>
                      </a>
                    );
                  })
                ) : (
                  <p className="no-deep-socials" style={{ opacity: 0.7 }}>No verified direct profile links found.</p>
                )}
              </div>
            </div>
          </div>

          {deepData.articles?.length > 0 && (
            <div className="card-section deep-records">
              <h2>Articles & Publications</h2>
              <div className="deep-articles-list">
                {deepData.articles.map((art, i) => (
                  <a key={i} href={art.url} target="_blank" rel="noreferrer" className="deep-article-item">
                    <h4>{art.title}</h4>
                    <p>{art.snippet}</p>
                    <span className="art-url">{new URL(art.url).hostname}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : data && (
        <div className="results-wrapper">
          <div className="results-list">

            {/* 1. LOCAL PROFILES (HIGHEST PRIORITY) */}
            {data.profile?.length > 0 && (
              <div className="card-section local-section">
                <h2>Verified Profiles</h2>
                {data.profile.map(item => (
                  <div key={item.id} className="result-item local-item">
                    <h3>{item.text}</h3>
                    <div className="result-meta">
                      <span className="badge verified">Verified (Local DB)</span>
                      <span>Source: {item.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 2. LOCAL RECORDS */}
            {data.records?.length > 0 && (
              <div className="card-section local-section">
                <h2>Internal Records</h2>
                {data.records.map(item => (
                  <div key={item.id} className="result-item local-item">
                    <h3>{item.text}</h3>
                    <div className="result-meta">
                      <span className="badge verified">Verified (Local DB)</span>
                      <span>Source: {item.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. IMAGE GALLERY (HORIZONTAL SWIPE) */}
            {data.images?.length > 0 && (
              <div className="card-section gallery-section">
                <h2>Media Gallery</h2>
                <div className="image-gallery-swipe">
                  {data.images.slice(0, 6).map((img, idx) => (
                    <div key={idx} className="gallery-item">
                      <img
                        src={img}
                        alt={`Finding ${idx}`}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.target.style.display = 'none'; // Hide broken images
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. SOCIAL & INTERNET SOURCES (RESTORED TO CARDS) */}
            {internetLoaded && (
              <div className="card-section">
                <h2>Internet Results</h2>

                <div className="sources-grid">
                  {data?.auxiliary
                    ?.filter(item => item.source === "Internet" && item.provider !== "Google")
                    .map((item) => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-card social-card"
                      >
                        <div className="source-header">
                          <span className={`social-icon ${item.provider.toLowerCase().split('/')[0]}`}></span>
                          <span className="source-provider">{item.provider}</span>
                        </div>
                        <div className="source-title">{item.title || item.text?.substring(0, 50)}</div>
                        <div className="source-footer">
                          <span className="badge">Public Profile</span>
                        </div>
                      </a>
                    ))}
                </div>

                {(!data?.auxiliary ||
                  data.auxiliary.filter(i => i.source === "Internet").length === 0) && (
                    <p style={{ textAlign: "center", opacity: 0.6, padding: "1rem" }}>
                      No social research sources identified.
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>
      )}
      {/* FEEDBACK FORM POPUP */}
      {showFeedbackForm && (
        <div className="modal-overlay">
          <form className="feedback-modal" onSubmit={handleFeedbackSubmit}>
            <h2>Help us find the right person</h2>
            <div className="form-group">
              <label>Name (Required)</label>
              <input
                type="text"
                required
                value={feedbackData.name}
                onChange={e => setFeedbackData({ ...feedbackData, name: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Keyword (Doctor, Engineer, etc.) (Required)</label>
              <input
                type="text"
                required
                value={feedbackData.keyword}
                onChange={e => setFeedbackData({ ...feedbackData, keyword: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Location (Optional)</label>
              <input
                type="text"
                value={feedbackData.location}
                onChange={e => setFeedbackData({ ...feedbackData, location: e.target.value })}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="cancel-btn" onClick={() => setShowFeedbackForm(false)}>Cancel</button>
              <button type="submit" className="submit-btn" disabled={savingFeedback}>
                {savingFeedback ? "Searching..." : "Search"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default MultiSearchPage;
