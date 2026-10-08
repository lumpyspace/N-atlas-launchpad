/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // N-ATLAS accent (Nigerian green nod), expanded for a calmer, Linear/Vercel feel.
        forge: {
          50: "#ecfdf3",
          100: "#d1fadf",
          200: "#a6f4c5",
          400: "#34d17d",
          500: "#0f9d58",
          600: "#0b7f46",
          700: "#096538",
        },
        ink: "#0b1220", // near-black for headings
      },
      boxShadow: {
        card: "0 1px 2px rgba(16, 24, 40, 0.04), 0 1px 3px rgba(16, 24, 40, 0.06)",
        pop: "0 8px 30px rgba(16, 24, 40, 0.10)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
