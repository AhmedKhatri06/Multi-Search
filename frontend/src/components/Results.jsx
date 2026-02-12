const Results = ({ results }) => {
  if (!results) return null;

  return (
    <div style={{ marginTop: "20px" }}>
      <h3>Raw Search Results</h3>

      <pre
        style={{
          background: "#111",
          color: "#0f0",
          padding: "10px",
          overflowX: "auto",
        }}
      >
        {JSON.stringify(results, null, 2)}
      </pre>
    </div>
  );
};

export default Results;
