const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "Dailydle", 
    subtitle: "Daily guess characters game", 
    description: "Daily guess characters from famous games, movies, TV shows, and more",
    screenshotUrls: [`${ROOT_URL}/screenshot-portrait.png`],
    iconUrl: `${ROOT_URL}/logo-farcaster.png`, // Utiliser le logo comme icône
    splashImageUrl: `${ROOT_URL}/blue-hero.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "social",
    tags: ["game", "daily", "guess", "characters", "blockchain", "onchain", "puzzle"],
    heroImageUrl: `${ROOT_URL}/blue-hero.png`, 
    tagline: "Guess the character of the day! New daily challenges across multiple collections on Base.",
    ogTitle: "Dailydle - Daily Character Guessing Game on Base",
    ogDescription: "Take on the daily Dailydle challenge! Guess the mystery character from League of Legends, Dota, movies, TV shows, and more. Built on Base blockchain.",
    ogImageUrl: `${ROOT_URL}/logo-farcaster.png`,
  },
} as const;

