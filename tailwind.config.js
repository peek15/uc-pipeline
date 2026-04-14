/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Backgrounds ──
        bg:    'var(--bg)',
        bg2:   'var(--bg2)',
        bg3:   'var(--bg3)',
        card:  'var(--card)',
        sheet: 'var(--sheet)',

        // ── Text ──
        t1: 'var(--t1)',
        t2: 'var(--t2)',
        t3: 'var(--t3)',
        t4: 'var(--t4)',

        // ── Borders ──
        border:     'var(--border)',
        'border2':  'var(--border2)',
        'border-in':'var(--border-in)',

        // ── Fills ──
        fill:  'var(--fill)',
        fill2: 'var(--fill2)',

        // ── Accent ──
        gold: 'var(--gold)',

        // ── Stage colors ──
        stage: {
          new:       'var(--c-new)',
          approved:  'var(--c-approved)',
          scripted:  'var(--c-scripted)',
          produced:  'var(--c-produced)',
          published: 'var(--c-published)',
          rejected:  'var(--c-rejected)',
        },
      },

      fontFamily: {
        display: ["'DM Sans'", "-apple-system", "system-ui", "sans-serif"],
        body:    ["'DM Sans'", "-apple-system", "system-ui", "sans-serif"],
        mono:    ["'DM Mono'", "ui-monospace", "monospace"],
        serif:   ["Georgia", "'Times New Roman'", "serif"],
      },

      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
