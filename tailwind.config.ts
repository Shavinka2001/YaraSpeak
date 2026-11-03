import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        emerald: {
          deep: "#064E3B",
          soft: "#0F6B52",
          mist: "#D7E7E0",
        },
        sand: {
          DEFAULT: "#FDFBF7",
          warm: "#F5EFE4",
          deep: "#EBE3D4",
        },
        stone: {
          line: "#E7E2D8",
        },
        coral: "#E2725B",
      },
      fontFamily: {
        sans: ["var(--font-plus-jakarta)", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(6,78,59,0.04), 0 8px 24px -16px rgba(6,78,59,0.22)",
      },
    },
  },
  plugins: [],
};
export default config;
