import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#dbe6ff",
          200: "#bccdfb",
          300: "#8fa9f5",
          400: "#5f80ea",
          500: "#3d63dd",
          600: "#2f4fc0",
          700: "#26409c",
          800: "#20357d",
          900: "#1c2e64"
        }
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 6px -1px rgb(15 23 42 / 0.05)"
      },
      borderRadius: {
        xl: "0.875rem"
      }
    }
  },
  plugins: []
};

export default config;
