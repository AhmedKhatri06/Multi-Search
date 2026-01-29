import { useEffect, useState } from "react";
import "../index.css";

const API_URL = import.meta.env.VITE_API_URL;

const MultiSearchPage = () => {
  const [query, setQuery] = useState(() => localStorage.getItem("search-query") || "");
  const [data, setData] = useState(() => JSON.parse(localStorage.getItem("search-data")) || null);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [recent, setRecent] = useState([]);
  const [hasSearched, setHasSearched] = useState(() => localStorage.getItem("has-searched") === "true");
  const [internetLoaded, setInternetLoaded] = useState(false);

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
  }, [query, data, hasSearched]);

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
      setHasSearched(true);

      const res = await fetch(`${API_URL}/api/multi-search/identify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: query }),
      });

      const result = await res.json();
      if (Array.isArray(result)) {
        setCandidates(result);
      } else {
        console.warn("No confident candidates found.");
        // If no candidates, maybe fallback to direct search?
        search(query);
      }
    } catch (err) {
      console.error("Identification failed:", err);
    } finally {
      setIsIdentifying(false);
    }
  };

  const handleCandidateSelect = (candidate) => {
    const refinedQuery = `${candidate.name} ${candidate.description}`;
    setCandidates([]);
    // Automatically trigger deep search with internet
    search(refinedQuery, true);
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
    setCandidates([]);
    setHasSearched(false);
    setInternetLoaded(false);
    localStorage.removeItem("search-query");
    localStorage.removeItem("search-data");
    localStorage.removeItem("has-searched");
  };

  return (
    <div className="container">
      <h1>DeepSearch<sup>AI</sup></h1>
      <div className="search-box">
        {hasSearched && (
          <button
            className="search-back-btn"
            onClick={handleReset}
            title="Reset Research"
          >
            ←
          </button>
        )}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (candidates.length === 0 ? handleIdentify() : search(query, true))}
          placeholder="Ask DeepSearch to research anyone..."
        />
        <button
          onClick={() => candidates.length === 0 ? handleIdentify() : search(query, true)}
          disabled={loading || isIdentifying}
        >
          {loading || isIdentifying ? "Analyzing..." : "Research"}
        </button>
      </div>

      {(loading || isIdentifying) && (
        <div className="research-status">
          <div className="pulse-dot"></div>
          {isIdentifying ? "Identifying possible matches..." : "Searching local databases and social profiles..."}
        </div>
      )}

      {recent.length > 0 && !hasSearched && (
        <div className="recent-searches">
          <h3>Previous Reports</h3>
          <div className="recent-items-container">
            {recent.map(item => (
              <div key={item} className="recent-item">
                <span onClick={() => search(item, true)}>{item}</span>
                <button
                  onClick={() => {
                    const filtered = recent.filter(r => r !== item);
                    setRecent(filtered);
                    localStorage.setItem(
                      "recent-searches",
                      JSON.stringify(filtered)
                    );
                  }}
                  title="Remove from history"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CANDIDATES LIST (STAGE 1) */}
      {candidates.length > 0 ? (
        <div className="results-wrapper">
          <div className="candidates-section">
            <h2 className="section-title">Who are you looking for?</h2>
            <p className="section-subtitle">Select a person to see detailed social research</p>
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
            <button className="search-anyway-btn" onClick={() => {
              setCandidates([]);
              search(query, true);
            }}>
              Search for "{query}" directly instead
            </button>
          </div>
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
    </div>
  );
};

export default MultiSearchPage;
