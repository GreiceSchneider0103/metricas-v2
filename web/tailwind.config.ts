import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          500: "#3d63dd",
          600: "#2f4fc0",
          700: "#26409c"
        }
      }
    }
  },
  plugins: []
};

export default config;
