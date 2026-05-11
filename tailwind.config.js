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
        accent: 'var(--accent)',
        'accent-bg': 'var(--accent-bg)',
        'accent-border': 'var(--accent-border)',
        ce: {
          bg: 'var(--ce-bg)',
          surface: 'var(--ce-surface)',
          raised: 'var(--ce-surface-raised)',
          elevated: 'var(--ce-surface-elevated)',
          border: 'var(--ce-border)',
          text: 'var(--ce-text)',
          muted: 'var(--ce-text-muted)',
          accent: 'var(--ce-accent)',
        },

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
        display: ["var(--font-display)"],
        body:    ["var(--font-body)"],
        mono:    ["var(--font-mono)"],
        serif:   ["var(--font-editorial)"],
        script:  ["var(--font-script)"],
      },

      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
        ce: 'var(--ce-shadow)',
      },

      borderRadius: {
        ce: 'var(--ce-radius)',
        'ce-sm': 'var(--ce-radius-sm)',
        'ce-lg': 'var(--ce-radius-lg)',
      },
    },
  },
  plugins: [],
};
