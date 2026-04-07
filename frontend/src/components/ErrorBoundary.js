import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      console.error('UI crash captured:', error, info);
      sessionStorage.setItem('lastUiError', JSON.stringify({
        message: error?.message || 'Unknown error',
        at: new Date().toISOString()
      }));
    } catch {}
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="error-boundary-screen">
        <div className="error-boundary-card">
          <div className="error-boundary-icon"><AlertTriangle size={34} /></div>
          <h2>حدث خطأ في الواجهة</h2>
          <p>تم إيقاف هذا الجزء لحماية التطبيق. يمكنك تحديث الصفحة للمتابعة أو الرجوع لاحقًا لنفس المكان بعد استعادة الحالة المحفوظة.</p>
          <div className="error-boundary-actions">
            <button className="profile-btn" onClick={this.handleReload}><RefreshCw size={16} /> إعادة تحميل</button>
          </div>
          {this.state.error?.message ? <div className="error-boundary-meta">{this.state.error.message}</div> : null}
        </div>
      </div>
    );
  }
}
