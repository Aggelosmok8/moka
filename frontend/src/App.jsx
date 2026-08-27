import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { ChartProvider } from "./contexts/ChartContext";
import HomePage from "./pages/HomePage";
import TeamPage from "./pages/TeamPage";
import MatchPage from "./pages/MatchPage";
import PricingPage from "./pages/PricingPage";
import PricingSuccessPage from "./pages/PricingSuccessPage";
import AuthCallback from "./pages/AuthCallback";
import ValueMatchesPage from "./pages/ValueMatchesPage";
import MatchesPage from "./pages/MatchesPage";
import LeaguesPage from "./pages/LeaguesPage";
import OddsComparisonPage from "./pages/OddsComparisonPage";
import MatchAnalysisPage from "./pages/MatchAnalysisPage";
import AccountPage from "./pages/AccountPage";
import ChartsPage from "./pages/ChartsPage";
import TeamsPage from "./pages/TeamsPage";
import "@/index.css";

function AppRouter() {
  // Detect auth callback synchronously during render to avoid race conditions
  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/matches" element={<MatchesPage />} />
      <Route path="/value" element={<Navigate to="/matches" replace />} />
      <Route path="/leagues" element={<LeaguesPage />} />
      <Route path="/odds" element={<Navigate to="/matches" replace />} />
      <Route path="/charts" element={<ChartsPage />} />
      <Route path="/teams" element={<TeamsPage />} />
      <Route path="/analysis/:id" element={<MatchAnalysisPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/team/:id" element={<TeamPage />} />
      <Route path="/match/:id" element={<MatchPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/pricing/success" element={<PricingSuccessPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ChartProvider>
          <Toaster position="top-right" theme="dark" />
          <AppRouter />
        </ChartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
