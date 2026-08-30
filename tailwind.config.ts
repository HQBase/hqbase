import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./app/**/*.{ts,tsx}", "./worker/**/*.ts"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--focus-border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))"
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        star: "hsl(var(--star))",
        rail: "hsl(var(--surface-rail))",
        sidebar: "hsl(var(--surface-sidebar))",
        toolbar: "hsl(var(--surface-toolbar))",
        list: "hsl(var(--surface-list))",
        reader: "hsl(var(--surface-reader))",
        selected: "hsl(var(--surface-selected))",
        hover: "hsl(var(--surface-hover))",
        divider: "hsl(var(--divider-subtle))",
        tertiary: "hsl(var(--text-tertiary))"
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "-apple-system", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      fontSize: {
        xs: ["12px", { lineHeight: "1.4", letterSpacing: "0em" }],
        sm: ["14px", { lineHeight: "1.5", letterSpacing: "0em" }],
        base: ["16px", { lineHeight: "1.5", letterSpacing: "-0.05px" }],
        lg: ["18px", { lineHeight: "1.5", letterSpacing: "-0.1px" }],
        xl: ["20px", { lineHeight: "1.4", letterSpacing: "-0.2px" }],
        "2xl": ["22px", { lineHeight: "1.25", letterSpacing: "-0.4px" }],
        "3xl": ["28px", { lineHeight: "1.2", letterSpacing: "-0.6px" }],
        "4xl": ["40px", { lineHeight: "1.15", letterSpacing: "-1px" }],
        "5xl": ["56px", { lineHeight: "1.1", letterSpacing: "-1.8px" }],
        "6xl": ["80px", { lineHeight: "1.05", letterSpacing: "-3px" }]
      },
      keyframes: {
        "overlay-in": {
          from: { opacity: "0" },
          to: { opacity: "1" }
        },
        "overlay-out": {
          from: { opacity: "1" },
          to: { opacity: "0" }
        },
        "sheet-in-left": {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(0)" }
        },
        "sheet-out-left": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-100%)" }
        },
        "sheet-in-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" }
        },
        "sheet-out-right": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(100%)" }
        }
      },
      animation: {
        "overlay-in": "overlay-in 0.18s ease-out",
        "overlay-out": "overlay-out 0.18s ease-in",
        "sheet-in-left": "sheet-in-left 0.22s ease-out",
        "sheet-out-left": "sheet-out-left 0.18s ease-in",
        "sheet-in-right": "sheet-in-right 0.22s ease-out",
        "sheet-out-right": "sheet-out-right 0.18s ease-in"
      }
    }
  },
  plugins: []
} satisfies Config;
