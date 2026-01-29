import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "confetti-fall": {
          "0%": { transform: "translateY(0) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(110vh) rotate(360deg)", opacity: "0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out forwards",
        "confetti-fall": "confetti-fall 2.5s ease-in forwards",
      },
      colors: {
        red: "hsl(var(--red) / <alpha-value>)",
        green: "hsl(var(--green) / <alpha-value>)",
        brown: "hsl(var(--brown) / <alpha-value>)",
        dark: "hsl(var(--dark) / <alpha-value>)",
        lightDark: "hsl(var(--lightDark) / <alpha-value>)",
        grey: "hsl(var(--grey) / <alpha-value>)",
        darkGrey: "hsl(var(--darkGrey) / <alpha-value>)",
        lightGrey: "hsl(var(--lightGrey) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
      },
    },
  },
  plugins: [],
};
export default config;
