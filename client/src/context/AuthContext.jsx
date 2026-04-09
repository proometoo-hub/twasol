import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { get } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('tawasol_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    get('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('tawasol_token');
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const value = useMemo(() => ({
    token,
    user,
    loading,
    login: (nextToken, nextUser) => {
      localStorage.setItem('tawasol_token', nextToken);
      setToken(nextToken);
      setUser(nextUser);
    },
    updateUser: (nextUser) => setUser(nextUser),
    logout: () => {
      localStorage.removeItem('tawasol_token');
      setToken(null);
      setUser(null);
    },
  }), [token, user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
