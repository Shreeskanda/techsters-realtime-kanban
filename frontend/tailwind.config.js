/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0a0f1e",
          900: "#0d1424",
          800: "#111827",
          700: "#1a2238",
          600: "#1e2d47",
        },
        charcoal: {
          800: "#1f2937",
          700: "#273044",
          600: "#2d3748",
        },
        accent: {
          blue: "#4f8ef7",
          indigo: "#6366f1",
          purple: "#8b5cf6",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui"],
      },
    },
  },
  plugins: [],
};
