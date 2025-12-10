/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: "#0d6efd",
        accent: "#111827",
        muted: "#6b7280",
      },
      boxShadow: {
        card: "0 15px 50px rgba(17, 24, 39, 0.08)",
      },
    },
  },
  plugins: [],
};

