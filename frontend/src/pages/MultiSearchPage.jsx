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

  const search = async (searchQuery = query) => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setQuery(searchQuery);
      setHasSearched(true);

      const res = await fetch(`${API_URL}/api/multi-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const result = await res.json();
      setData(result);

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

  return (
    <div className="container">
      <h1>Multi-Search</h1>
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
            title="Back to Search"
          >
            ←
          </button>
        )}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Enter name , ID , company name....."
        />
        <button onClick={() => search()} disabled={loading}>
          Search
        </button>

      </div>
      {recent.length > 0 && (
        <div className="recent-searches">
          <h3>Recent searches</h3>
          {recent.map(item => (
            <span key={item} className="recent-item">
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
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {data && (
        <div className="results-wrapper">
          <div className="results-list">
            {/* Loading AI Summary */}
            {loading && (
              <div className="card-section dashed">
                <p>Generating AI summary...</p>
              </div>
            )}

            {/* AI SUMMARY */}
            {data.aiSummary && (
              <div className="card-section ai-summary-card dashed">
                <h2>AI SUMMARY</h2>

                <p className="ai-summary-text">
                  {data.aiSummary}
                </p>

                {data.aiSummarySources?.length > 0 && (
                  <div className="ai-citations">
                    <span className="citation-label">Sources:</span>

                    {data.aiSummarySources.map((src, index) => (
                      src.url ? (
                        <a
                          key={index}
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="citation-chip"
                        >
                          {src.title}
                        </a>
                      ) : (
                        <span key={index} className="citation-chip muted">
                          {src.title}
                        </span>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}


            {/* VISUAL INSIGHTS */}
            {data.images?.length > 0 && (
              <div className="card-section dashed">
                <h2>VISUAL INSIGHTS</h2>
                <div className="visual-insights">
                  <img
                    src={data.images[0]}
                    className="main-portrait"
                    alt=""
                  />
                </div>
              </div>
            )}

            {/* PROFILES */}
            {data.profile?.length > 0 && (
              <div className="card-section dashed">
                <h2>PROFILES</h2>
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
              <div className="card-section dashed">
                <h2>RECORDS</h2>
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

            {/* RESOURCES */}
            {data.auxiliary?.length > 0 && (
              <div className="card-section dashed">
                <h2>RESOURCES</h2>
                {data.auxiliary.map(item => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="resource-link"
                  >
                    <div>
                      <span>{item.title}</span>
                      <span className="source">Source: {item.source} - {item.url}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

};

export default MultiSearchPage;
