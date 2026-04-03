"use client";
import { useEffect, useState } from "react";
import { Check, X, AlertCircle, Info } from "lucide-react";

// ── Global toast queue ──
let _listeners = [];
let _id = 0;

export function toast(message, type = "success", duration = 2500) {
  const id = ++_id;
  _listeners.forEach(fn => fn({ id, message, type, duration }));
  return id;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handler = (t) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
      }, t.duration);
    };
    _listeners.push(handler);
    return () => { _listeners = _listeners.filter(fn => fn !== handler); };
  }, []);

  if (!toasts.length) return null;

  return (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:100, display:"flex", flexDirection:"column", gap:8, alignItems:"center", pointerEvents:"none" }}>
      {toasts.map(t => {
        const Icon = t.type === "success" ? Check : t.type === "error" ? X : t.type === "warning" ? AlertCircle : Info;
        return (
          <div key={t.id} className="anim-fade" style={{
            display:"flex", alignItems:"center", gap:8,
            padding:"10px 16px", borderRadius:99,
            background:"var(--t1)", color:"var(--bg)",
            fontSize:13, fontWeight:500,
            boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
            whiteSpace:"nowrap",
          }}>
            <Icon size={14} />
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
