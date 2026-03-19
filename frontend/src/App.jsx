import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LookUpPage from "./pages/MultiSearchPage";
import NexaSearchPage from "./pages/NexaSearchPage";


import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LookUpPage />} />
          <Route path="/nexa-search" element={<NexaSearchPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
