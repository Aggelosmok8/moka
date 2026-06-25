import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import { getToken, setToken, clearToken } from "../lib/api";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export const authApi = axios.create({
  baseURL: `${BACKEND_URL}/api`,
  withCredentials: false,  // no cookies — uses Bearer token
});

// Attach Bearer token on every authApi request
authApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

const AuthCtx = createContext({
  user: null,
  loading: true,
  isPro: false,
  refresh: async () => {},
  logout: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const r = await authApi.get("/auth/me");
      setUser(r.data);
    } catch {
      // Token expired or invalid — clear it
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // If returning from OAuth, AuthCallback will handle token storage first
    if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
      setLoading(false);
      return;
    }
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      await authApi.post("/auth/logout");
    } catch {
      // ignore errors on logout
    }
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{
      user,
      loading,
      isPro: !!user?.is_pro,
      refresh: checkAuth,
      logout,
    }}>
      {children}
    </AuthCtx.Provider>
  );
};

export const useAuth = () => useContext(AuthCtx);

// Helper for AuthCallback page to store the token after OAuth
export function storeAuthToken(token) {
  setToken(token);
}
