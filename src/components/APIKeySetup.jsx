// ========================================================
// APIKeySetup — first-run Finnhub API key entry
// ========================================================
import React, { useState } from "react";
import { saveApiKey } from "../storage.js";

export default function APIKeySetup({ onSave }) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!key.trim()) return;
    setSaving(true);
    await saveApiKey(key.trim());
    onSave(key.trim());
    setSaving(false);
  }

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20, background: "linear-gradient(160deg, #050508, #0a0a12)",
    }}>
      <div style={{
        maxWidth: 360, width: "100%",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: 24,
      }}>
        <div style={{ fontSize: 48, marginBottom: 16, textAlign: "center" }}>🔑</div>
        <div style={{
          fontSize: 22, fontWeight: 800, color: "#fff",
          textAlign: "center", marginBottom: 8,
          background: "linear-gradient(135deg, #fff, rgba(255,255,255,0.6))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          ตั้งค่า Finnhub API
        </div>
        <div style={{
          fontSize: 12, color: "rgba(255,255,255,0.5)",
          textAlign: "center", marginBottom: 20, lineHeight: 1.5,
        }}>
          ใส่ API Key จาก Finnhub เพื่อรับข้อมูล Real-time<br/>
          <a href="https://finnhub.io/dashboard" target="_blank" rel="noreferrer"
            style={{ color: "#6366f1", textDecoration: "none" }}>
            📋 เปิด Finnhub Dashboard →
          </a>
        </div>

        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5 }}>
          API KEY
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="ctq..."
          style={{
            width: "100%", marginTop: 6, marginBottom: 16,
            padding: "12px 14px",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 12, color: "#fff", fontSize: 13,
            fontFamily: "'Space Mono', monospace",
            outline: "none",
          }}
        />

        <button onClick={handleSave} disabled={!key.trim() || saving}
          style={{
            width: "100%", padding: "14px",
            background: key.trim() ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.05)",
            border: "none", borderRadius: 14,
            color: "#fff", fontSize: 14, fontWeight: 700,
            cursor: key.trim() ? "pointer" : "not-allowed",
          }}>
          {saving ? "กำลังบันทึก..." : "💾 บันทึก & เริ่มใช้งาน"}
        </button>

        <div style={{
          marginTop: 16, padding: 10,
          background: "rgba(34,197,94,0.08)",
          border: "1px solid rgba(34,197,94,0.2)",
          borderRadius: 10, fontSize: 10,
          color: "rgba(255,255,255,0.6)", lineHeight: 1.5,
        }}>
          🔒 <strong style={{ color: "#4ade80" }}>ปลอดภัย:</strong> API key เก็บในเครื่องคุณเท่านั้น
          ไม่ส่งไปเซิร์ฟเวอร์อื่น
        </div>
      </div>
    </div>
  );
}
