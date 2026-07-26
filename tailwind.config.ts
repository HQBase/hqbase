import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./index.html", "./app/**/*.{ts,tsx}", "./worker/**/*.ts"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
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
        }
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      fontFamily: {
        sans: ["Geist Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "SFMono-Regular", "ui-monospace", "monospace"]
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0"
          },
          to: {
            height: "var(--radix-accordion-content-height)"
          }
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)"
          },
          to: {
            height: "0"
          }
        },
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
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
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
