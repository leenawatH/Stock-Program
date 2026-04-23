import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// localStorage shim for window.storage used by the original component
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    get: async (key) => {
      const value = window.localStorage.getItem(key);
      return value != null ? { value } : null;
    },
    set: async (key, value) => {
      window.localStorage.setItem(key, value);
    },
    delete: async (key) => {
      window.localStorage.removeItem(key);
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
