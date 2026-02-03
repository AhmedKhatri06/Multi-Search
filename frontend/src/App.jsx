import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MultiSearchPage from "./pages/MultiSearchPage";
import NexaSearchPage from "./pages/NexaSearchPage";


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<NexaSearchPage />} />
        <Route path="/multi-search" element={<MultiSearchPage />} />
      </Routes>
    </Router>
  );
}

export default App;
