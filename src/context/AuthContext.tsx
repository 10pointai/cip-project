import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppUser, UserPermissions } from '../types';
import { api } from '../services/api';

interface AuthContextValue {
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (username: string, password: string) => Promise<{ success: boolean; user: AppUser; message: string }>;
  setupPassword: (payload: { username: string; password: string; activationCode?: string }) => Promise<{ success: boolean; user: AppUser; message: string }>;
  logout: () => void;
  hasPermission: (permissionKey: keyof UserPermissions) => boolean;
  refreshCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const stored = localStorage.getItem('ops_auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setTokenState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('ops_auth_token');
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Validate session on boot
  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      const savedToken = api.getToken();
      if (!savedToken) {
        if (isMounted) {
          setIsLoading(false);
          setCurrentUser(null);
        }
        return;
      }

      try {
        const res = await api.getMe();
        if (isMounted && res.success && res.user) {
          setCurrentUser(res.user);
          localStorage.setItem('ops_auth_user', JSON.stringify(res.user));
        }
      } catch (err) {
        console.warn('[AuthContext] Session validation failed or expired. Resetting session token.');
        api.setToken(null);
        localStorage.removeItem('ops_auth_user');
        if (isMounted) {
          setCurrentUser(null);
          setTokenState(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ username, password });
      if (res.success && res.token && res.user) {
        setCurrentUser(res.user);
        setTokenState(res.token);
        localStorage.setItem('ops_auth_user', JSON.stringify(res.user));
        return res;
      }
      throw new Error(res.message || 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setupPassword = useCallback(async (payload: { username: string; password: string; activationCode?: string }) => {
    setIsLoading(true);
    try {
      const res = await api.setupPassword(payload);
      if (res.success && res.token && res.user) {
        setCurrentUser(res.user);
        setTokenState(res.token);
        localStorage.setItem('ops_auth_user', JSON.stringify(res.user));
        return res;
      }
      throw new Error(res.message || 'Account setup failed.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    api.setToken(null);
    setCurrentUser(null);
    setTokenState(null);
    localStorage.removeItem('ops_auth_user');
    localStorage.removeItem('ops_auth_token');
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      if (res.success && res.user) {
        setCurrentUser(res.user);
        localStorage.setItem('ops_auth_user', JSON.stringify(res.user));
      }
    } catch (err) {
      console.warn('[AuthContext] Failed to refresh user profile:', err);
    }
  }, []);

  const hasPermission = useCallback((permissionKey: keyof UserPermissions): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'super_admin') return true;
    return !!currentUser.permissions?.[permissionKey];
  }, [currentUser]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser && !!token,
        isLoading,
        token,
        login,
        setupPassword,
        logout,
        hasPermission,
        refreshCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
