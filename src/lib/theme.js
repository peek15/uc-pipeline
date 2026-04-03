// Theme-aware color references using CSS variables
// All components should use these instead of hardcoded colors

export const theme = {
  bg: "var(--bg)",
  bg2: "var(--bg2)",
  bg3: "var(--bg3)",
  card: "var(--card)",
  cardHover: "var(--card-hover)",
  input: "var(--input)",
  nav: "var(--nav)",
  modal: "var(--modal)",
  sheet: "var(--sheet)",
  border: "var(--border)",
  border2: "var(--border2)",
  borderIn: "var(--border-in)",
  t1: "var(--t1)",
  t2: "var(--t2)",
  t3: "var(--t3)",
  t4: "var(--t4)",
  fill: "var(--fill)",
  fill2: "var(--fill2)",
  shadow: "var(--shadow)",
  gold: "var(--gold)",
  goldSubtle: "var(--gold-subtle)",
  goldBorder: "var(--gold-border)",
};

// Stage colors stay fixed — they're the "highlights" in the monochrome design
export const stageColor = (status) => ({
  accepted: "#007AFF",
  approved: "#34C759",
  scripted: "#AF52DE",
  produced: "#FF9F0A",
  published: "#B8860B",
  rejected: "#FF3B30",
  archived: "#8E8E93",
}[status] || "#8E8E93");
