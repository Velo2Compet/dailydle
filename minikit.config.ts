const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
const header = process.env.HEADER ?? "";
const payload = process.env.PAYLOAD ?? "";
const signature = process.env.SIGNATURE ?? "";

/**
 * MiniApp configuration object. Must follow the Farcaster MiniApp specification.
 *
 * @see {@link https://miniapps.farcaster.xyz/docs/guides/publishing}
 */
export const minikitConfig = {
  accountAssociation: {
    header: header,
    payload: payload,
    signature: signature,
  },
  miniapp: {
    version: "1",
    name: "Dailydle", 
    subtitle: "Daily guess characters game", 
    description: "Daily guess characters from famous games, movies, TV shows, and more",
    screenshotUrls: [`${ROOT_URL}/logo-farcaster.png`],
    iconUrl: `${ROOT_URL}/logo-farcaster.png`, // Utiliser le logo comme icône
    splashImageUrl: `${ROOT_URL}/logo-farcaster.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "social",
    tags: ["game", "daily", "guess", "characters", "onchain"],
    heroImageUrl: `${ROOT_URL}/logo-farcaster.png`,
    tagline: "Guess the character of the day!", // max 30 chars
    ogTitle: "Dailydle - Daily Character Guess", // max 30 chars
    ogDescription: "Guess the daily mystery character from games, movies & TV. Built on Base.", // max 100 chars
    ogImageUrl: `${ROOT_URL}/logo-farcaster.png`,
    noindex: false, // true = exclude from search, false = include (default)
  },
} as const;

