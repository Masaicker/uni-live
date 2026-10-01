import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#111214",
        surface: "#191B1E",
        "surface-elevated": "#22252A",
        accent: "#8AABF5",
        foreground: "#E8EAED",
        muted: "#989FA9",
        border: "#34383F",
        success: "#89BFA3",
        warning: "#D5B479",
        danger: "#DF9292",
      },
      fontFamily: {
        sans: ["Segoe UI", "Microsoft YaHei", "system-ui", "sans-serif"],
        display: ["Segoe UI", "Microsoft YaHei", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
