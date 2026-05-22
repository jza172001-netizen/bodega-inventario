
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
}

class ErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state = { error: null };
    static getDerivedStateFromError(e: Error) { return { error: e }; }
    render() {
        if (this.state.error) {
            return (
                <div style={{ padding: 32, fontFamily: 'sans-serif', maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
                    <p style={{ fontSize: 48 }}>⚠️</p>
                    <h2 style={{ color: '#1e40af' }}>Error al cargar Bodega Pro</h2>
                    <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 8 }}>
                        {(this.state.error as Error).message}
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{ marginTop: 16, padding: '10px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}
                    >
                        Recargar
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
