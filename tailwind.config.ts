import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./config/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#14213d",
        sand: "#f3efe6",
        ember: "#c26a32",
        moss: "#56765f",
        cloud: "#f7f9fc"
      },
      boxShadow: {
        panel: "0 18px 40px rgba(20, 33, 61, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
