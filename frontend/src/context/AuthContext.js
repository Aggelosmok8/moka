import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { tokenStore, apiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    if (!tokenStore.get()) {
      setUser(false);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data.user);
      setSubscription(data.subscription);
    } catch {
      tokenStore.clear();
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      tokenStore.set(data.token);
      setUser(data.user);
      await refreshStatus();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) || e.message };
    }
  };

  const register = async (name, email, password) => {
    try {
      const { data } = await api.post("/auth/register", { name, email, password });
      tokenStore.set(data.token);
      setUser(data.user);
      await refreshStatus();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) || e.message };
    }
  };

  const logout = () => {
    tokenStore.clear();
    setUser(false);
    setSubscription(null);
  };

  const refreshStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/subscription/status");
      setSubscription(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const isPro = !!subscription?.is_pro;

  return (
    <AuthContext.Provider
      value={{ user, subscription, loading, login, register, logout, refreshStatus, isPro }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
