import React from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./contexts/AuthContext";
import { ChartProvider } from "./contexts/ChartContext";
import { PortfolioProvider } from "./contexts/PortfolioContext";
import { LiveScoresProvider } from "./contexts/LiveScoresContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import AutoTranslate from "./components/AutoTranslate";
import ErrorBoundary from "./components/ErrorBoundary";
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
import PortfolioPage from "./pages/PortfolioPage";
import SportsPage from "./pages/SportsPage";
import LeagueDetailPage from "./pages/LeagueDetailPage";
import NewsPage from "./pages/NewsPage";
import ComparePage from "./pages/ComparePage";
import SlipFab from "./components/SlipFab";
import DevLoginPanel from "./components/DevLoginPanel";
import { useAuth } from "./contexts/AuthContext";
import "@/index.css";

// Signed-out visitors only get the entry page and Pricing; everything else
// sends them back to "/" where the Google sign-in / trial CTAs live.
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-zinc-400 text-sm flex items-center gap-2" data-testid="auth-gate-loading">
          <span className="w-2 h-2 rounded-full bg-[#39FF14] live-dot" /> Loading…
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return children;
}

const Gated = ({ element }) => <RequireAuth>{element}</RequireAuth>;

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
      <Route path="/matches" element={<Gated element={<MatchesPage />} />} />
      <Route path="/value" element={<Navigate to="/matches" replace />} />
      <Route path="/leagues" element={<Gated element={<LeaguesPage />} />} />
      <Route path="/leagues/:slug" element={<Gated element={<LeagueDetailPage />} />} />
      <Route path="/odds" element={<Navigate to="/matches" replace />} />
      <Route path="/charts" element={<Gated element={<ChartsPage />} />} />
      <Route path="/portfolio" element={<Gated element={<PortfolioPage />} />} />
      <Route path="/news" element={<Gated element={<NewsPage />} />} />
      <Route path="/compare" element={<Gated element={<ComparePage />} />} />
      <Route path="/sports" element={<Gated element={<SportsPage />} />} />
      <Route path="/teams" element={<Gated element={<TeamsPage />} />} />
      <Route path="/analysis/:id" element={<Gated element={<MatchAnalysisPage />} />} />
      <Route path="/account" element={<Gated element={<AccountPage />} />} />
      <Route path="/team/:id" element={<Gated element={<TeamPage />} />} />
      <Route path="/match/:id" element={<Gated element={<MatchPage />} />} />
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
        <LanguageProvider>
          <ChartProvider>
            <PortfolioProvider>
              <LiveScoresProvider>
                <Toaster position="top-right" theme="dark" />
                <AutoTranslate />
                <ErrorBoundary>
                  <AppRouter />
                </ErrorBoundary>
                <SlipFab />
                <DevLoginPanel />
              </LiveScoresProvider>
            </PortfolioProvider>
          </ChartProvider>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
