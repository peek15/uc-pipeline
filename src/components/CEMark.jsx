"use client";

// 8-ray asterisk mark — the Creative Engine logo.
// Props: size, color, strokeWidth, spin, breathe, style

export function CEMark({ size = 16, color = "currentColor", strokeWidth = 1, spin = false, breathe = false, style = {} }) {
  const cx = 12, cy = 12;
  const long = 9;
  const short = 6.4;
  const diag = short / Math.sqrt(2);

  const animStyle = spin
    ? { animation: "ceMarkSpin 6s linear infinite", transformOrigin: "12px 12px" }
    : breathe
    ? { animation: "ceMarkBreathe var(--ce-breath-dur, 2.4s) ease-in-out infinite", transformOrigin: "12px 12px" }
    : {};

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block", ...animStyle, ...style }}
    >
      {/* horizontal */}
      <line x1={cx - long} y1={cy} x2={cx + long} y2={cy} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* vertical */}
      <line x1={cx} y1={cy - long} x2={cx} y2={cy + long} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      {/* diagonals (shorter, dimmer) */}
      <line x1={cx - diag} y1={cy - diag} x2={cx + diag} y2={cy + diag} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.6" />
      <line x1={cx - diag} y1={cy + diag} x2={cx + diag} y2={cy - diag} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.6" />
      {/* center dot */}
      <circle cx={cx} cy={cy} r="1.2" fill={color} />
    </svg>
  );
}

export function CELogo({ size = 13, color, mono = false }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: color || "var(--ce-text)" }}>
      <CEMark size={size + 3} strokeWidth={1.1} />
      {!mono && (
        <span style={{ fontSize: size, fontWeight: 600, letterSpacing: "-0.01em" }}>Creative Engine</span>
      )}
    </div>
  );
}

export function CELoader({ label = "Working", size = 18 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, color: "var(--ce-text-3)", fontSize: 12 }}>
      <CEMark size={size} strokeWidth={1.1} spin color="var(--ce-live)" />
      {label && <span>{label}</span>}
    </div>
  );
}
