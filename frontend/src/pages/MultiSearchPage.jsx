import { useEffect, useState } from "react";
import "../index.css";

console.log(import.meta.env.VITE_API_URL);
const API_URL = import.meta.env.VITE_API_URL;

const MultiSearchPage = () => {
  const [query, setQuery] = useState(() => localStorage.getItem("search-query") || "");
  const [data, setData] = useState(() => JSON.parse(localStorage.getItem("search-data")) || null);
  const [loading, setLoading] = useState(false);
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
    if (score >= 40) return "Medium relevance";
    return "Medium relevance";
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
    }
    catch (err) {
      console.error(err);
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h1>DeepSearch<sup>AI</sup></h1>
      <div className="search-box">
        {hasSearched && (
          <button
            className="search-back-btn"
            onClick={() => {
              setQuery("");
              setData(null);
              setHasSearched(false);
              localStorage.removeItem("search-query");
              localStorage.removeItem("search-data");
              localStorage.removeItem("has-searched");
            }}
            title="Reset Research"
          >
            ←
          </button>
        )}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Ask DeepSearch to research anything..."
        />
        <button onClick={() => search()} disabled={loading}>
          {loading ? "Researching..." : "DeepSearch"}
        </button>
      </div>

      {loading && (
        <div className="research-status">
          <div className="pulse-dot"></div>
          Scanning internal systems and external sources...
        </div>
      )}
      {recent.length > 0 && !hasSearched && (
        <div className="recent-searches">
          <h3>Previous Reports</h3>
          <div className="recent-items-container">
            {recent.map(item => (
              <div key={item} className="recent-item">
                <span onClick={() => search(item)}>{item}</span>
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

      {data && (
        <div className="results-wrapper">
          <div className="results-list">
            {/* VISUAL INSIGHTS */}
            {data.images?.length > 0 && (
              <div className="card-section">
                <h2>Visual Insights</h2>
                <div className="visual-insights">
                  <img
                    src={data.images[0]}
                    className="main-portrait"
                    alt="Visual insight"
                  />
                </div>
              </div>
            )}

            {/* PROFILES */}
            {data.profile?.length > 0 && (
              <div className="card-section">
                <h2>Profiles</h2>
                {data.profile.map(item => (
                  <div key={item.id} className="result-item">
                    <h3>{item.text}</h3>
                    <div className="result-meta">
                      <span className="badge">
                        {getRelevanceLabel(item.score)}
                      </span>
                      <span>Source: {item.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* RECORDS */}
            {data.records?.length > 0 && (
              <div className="card-section">
                <h2>Records</h2>
                {data.records.map(item => (
                  <div key={item.id} className="result-item">
                    <h3>{item.text}</h3>
                    <div className="result-meta">
                      <span className="badge">
                        {getRelevanceLabel(item.score)}
                      </span>
                      <span>Source: {item.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {data && !internetLoaded && (
              <div style={{ textAlign: "center", margin: "20px 0" }}>
                <button
                  onClick={() => search(query, true)}
                  disabled={loading}
                  className="src-btn"
                >
                  🔍 Search on Internet
                </button>
              </div>
            )}
            {/* INTERNET RESULTS AS SOURCES GRID */}
            {internetLoaded && (
              <div className="card-section">
                <h2>Research Sources</h2>
                <div className="sources-grid">
                  {data?.auxiliary
                    ?.filter(item => item.source === "Internet")
                    .map(item => (
                      <a
                        key={item.id}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="source-card"
                      >
                        <div className="source-title">{item.title || item.text}</div>
                        <div className="source-url">{item.provider}</div>
                        <div className="source-footer">
                          {item.confidence && (
                            <span className="badge">{item.confidence}</span>
                          )}
                        </div>
                      </a>
                    ))}
                </div>

                {/* Detailed Internet Findings if any extra text exists */}
                {data?.auxiliary?.filter(item => item.source === "Internet" && item.text && item.text.length > 100).length > 0 && (
                  <div className="internet-details">
                    <h3>Detailed Findings</h3>
                    {data.auxiliary
                      .filter(item => item.source === "Internet" && item.text && item.text.length > 100)
                      .map(item => (
                        <div key={`detail-${item.id}`} className="result-item">
                          <p>{item.text}</p>
                        </div>
                      ))}
                  </div>
                )}

                {(!data?.auxiliary ||
                  data.auxiliary.filter(i => i.source === "Internet").length === 0) && (
                    <p style={{ textAlign: "center", opacity: 0.6, padding: "1rem" }}>
                      No internet research sources identified.
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
