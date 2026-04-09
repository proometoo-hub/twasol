import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import AppPage from './pages/AppPage';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <div className="brand-mark large">ت</div>
        <h1>Tawasol</h1>
        <p>Preparing your workspace…</p>
        <div className="loading-dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { token, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={token ? <Navigate to="/home" replace /> : <LoginPage />} />
      <Route path="/" element={<Navigate to={token ? '/home' : '/login'} replace />} />
      <Route path="/*" element={token ? <AppPage /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
