import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import MultiSearchPage from "./pages/MultiSearchPage";
import NexaSearchPage from "./pages/NexaSearchPage";


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MultiSearchPage />} />
        <Route path="/nexa-search" element={<NexaSearchPage />} />
      </Routes>
    </Router>
  );
}

export default App;
