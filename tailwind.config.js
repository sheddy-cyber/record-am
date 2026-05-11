/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#ddf8ff",
          100: "#b8efff",
          200: "#7de5ff",
          300: "#36d7ff",
          400: "#00c0eb",
          500: "#00a7d6",
          600: "#008db2",
          700: "#006f8c",
          800: "#10576c",
          900: "#111c2b",
        },
        success: {
          50:  "#e8fdf2",
          500: "#12B76A",
          600: "#0da35e",
        },
        warning: {
          50:  "#fffbeb",
          500: "#F79009",
          600: "#d97706",
        },
        danger: {
          50:  "#fef2f2",
          500: "#F04438",
          600: "#dc2626",
        },
        neutral: {
          50:  "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      }
    },
  },
  plugins: [],
};
