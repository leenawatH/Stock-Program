import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Safe localStorage shim for window.storage (iOS Private Mode / cookies blocked)
if (typeof window !== "undefined" && !window.storage) {
  const safeLS = {
    get(key) {
      try { return window.localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, value); } catch {}
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch {}
    },
  };
  window.storage = {
    get: async (key) => {
      const value = safeLS.get(key);
      return value != null ? { value } : null;
    },
    set: async (key, value) => safeLS.set(key, value),
    delete: async (key) => safeLS.remove(key),
  };
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[Quant L3] App crashed:", error, info);
  }
  render() {
    if (this.state.error) {
      const msg = String(this.state.error?.message || this.state.error);
      const stack = String(this.state.error?.stack || "").slice(0, 1200);
      return (
        <div style={{
          maxWidth: 360, margin: "60px auto", padding: 20, color: "#fff",
          background: "rgba(248,113,113,0.08)",
          border: "1px solid rgba(248,113,113,0.3)",
          borderRadius: 14, fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>App ขัดข้อง</div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 12, wordBreak: "break-word" }}>
            {msg}
          </div>
          <details style={{ fontSize: 10, opacity: 0.55, whiteSpace: "pre-wrap" }}>
            <summary style={{ cursor: "pointer" }}>รายละเอียด</summary>
            {stack}
          </details>
          <button
            onClick={() => { try { window.localStorage.clear(); } catch {} location.reload(); }}
            style={{
              marginTop: 14, width: "100%", padding: "10px 14px",
              background: "rgba(255,255,255,0.08)", color: "#fff",
              border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10,
              fontSize: 13, cursor: "pointer",
            }}
          >ล้าง storage แล้วรีโหลด</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById("root");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
