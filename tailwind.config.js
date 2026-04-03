/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: "#B8860B",
          dark: "#000000",
          card: "rgba(255,255,255,0.04)",
          border: "rgba(255,255,255,0.06)",
        },
        stage: {
          new: "#5AC8FA",
          approved: "#34C759",
          scripted: "#AF52DE",
          produced: "#FF9F0A",
          published: "#B8860B",
          rejected: "#FF3B30",
          archived: "#8E8E93",
        },
        lang: {
          en: "#5AC8FA",
          fr: "#007AFF",
          es: "#FF9500",
          pt: "#34C759",
        },
      },
      fontFamily: {
        display: ["'SF Pro Display'", "-apple-system", "system-ui", "sans-serif"],
        body: ["'SF Pro Text'", "-apple-system", "system-ui", "sans-serif"],
        mono: ["'SF Mono'", "ui-monospace", "monospace"],
        serif: ["'New York'", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};
