import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        stitch: {
          background: "var(--color-background)",
          surface: "var(--color-surface)",
          "surface-lowest": "var(--color-surface-lowest)",
          "surface-low": "var(--color-surface-low)",
          "surface-container": "var(--color-surface-container)",
          "surface-high": "var(--color-surface-high)",
          "surface-highest": "var(--color-surface-highest)",
          "surface-bright": "var(--color-surface-bright)",
          "surface-variant": "var(--color-surface-variant)",
          primary: "var(--color-primary)",
          "primary-container": "var(--color-primary-container)",
          "on-primary": "var(--color-on-primary)",
          secondary: "var(--color-secondary)",
          "secondary-container": "var(--color-secondary-container)",
          tertiary: "var(--color-tertiary)",
          "tertiary-container": "var(--color-tertiary-container)",
          error: "var(--color-error)",
          "error-container": "var(--color-error-container)",
          outline: "var(--color-outline)",
          "outline-variant": "var(--color-outline-variant)",
          text: "var(--color-text)",
          "text-dim": "var(--color-text-dim)",
          "text-muted": "var(--color-text-muted)"
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        data: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      fontSize: {
        "metric-lg": ["48px", { lineHeight: "1.1", letterSpacing: "0", fontWeight: "700" }],
        "headline-md": ["24px", { lineHeight: "32px", fontWeight: "600" }],
        "body-md": ["14px", { lineHeight: "22px", fontWeight: "400" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "500" }],
        "section-label": ["11px", { lineHeight: "16px", letterSpacing: "0", fontWeight: "600" }]
      },
      borderRadius: {
        stitch: "8px",
        "stitch-control": "6px"
      },
      spacing: {
        "stitch-unit": "4px",
        "stitch-gutter": "16px",
        "stitch-margin": "24px",
        "stitch-card": "20px",
        "stitch-sidebar": "240px",
        "stitch-topbar": "64px"
      },
      boxShadow: {
        "stitch-soft": "0 8px 24px rgba(0, 0, 0, 0.4)"
      },
      backgroundImage: {
        "stitch-grid":
          "linear-gradient(rgba(129, 207, 255, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(129, 207, 255, 0.08) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
