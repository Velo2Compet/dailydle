import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
