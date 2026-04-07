import React, { createContext, useContext, useState, useCallback } from 'react';
import { clearStoredAuthSession, getStoredToken, getStoredUser, storeAuthSession, updateStoredUser } from '../utils/authStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [token, setToken] = useState(() => getStoredToken());

  const login = useCallback((userData, tokenData) => {
    setUser(userData);
    setToken(tokenData);
    storeAuthSession(userData, tokenData);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStoredAuthSession();
  }, []);

  const updateUser = useCallback((userData) => {
    setUser(userData);
    updateStoredUser(userData);
  }, []);

  const isLoggedIn = !!(user && token);

  return (
    <AuthContext.Provider value={{ user, token, isLoggedIn, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
