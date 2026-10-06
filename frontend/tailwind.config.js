/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // N-ATLAS Forge accent (Nigerian green nod).
        forge: {
          500: "#0f9d58",
          600: "#0b7f46",
        },
      },
    },
  },
  plugins: [],
};
