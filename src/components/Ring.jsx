// Glowing ring gauge (identical copy in admin-panel and user-panel).
import { useId } from "react";

export default function Ring({ value = 0, label, display }) {
  const id = useId().replace(/:/g, "");
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const r = 84;
  const c = 2 * Math.PI * r;
  const angle = (pct / 100) * 2 * Math.PI;
  const dotX = 100 + r * Math.cos(angle);
  const dotY = 100 + r * Math.sin(angle);
  return (
    <div className="ring" role="img" aria-label={`${label}: ${display ?? Math.round(pct) + "%"}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id={"g" + id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffb4a2" />
            <stop offset="55%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d9ceff" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="97" fill="none" stroke="rgba(255,255,255,.28)" strokeWidth="0.8" />
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="10" />
        <circle
          cx="100" cy="100" r={r} fill="none"
          stroke={`url(#g${id})`} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          style={{ transition: "stroke-dasharray .8s ease" }}
        />
        {pct > 0 && <circle cx={dotX} cy={dotY} r="7" fill="#fff" style={{ filter: "drop-shadow(0 0 6px #fff)" }} />}
      </svg>
      <div className="ring-center">
        <b>{display ?? Math.round(pct) + "%"}</b>
        <small>{label}</small>
      </div>
    </div>
  );
}
