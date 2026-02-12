const SearchBox = ({ query, setQuery, onSearch }) => {
  return (
    <div className="search-box">
      <input
        type="text"
        placeholder="Ask anything about company data..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button onClick={onSearch}>Search</button>
    </div>
  );
};

export default SearchBox;
