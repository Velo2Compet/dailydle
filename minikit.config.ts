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
    name: "Quizzdle Onchain",
    iconUrl: `${ROOT_URL}/logo-farcaster.png`,
    homeUrl: ROOT_URL,
    imageUrl: `${ROOT_URL}/logo-farcaster.png`,
    buttonTitle: "Play Quizzdle",
    splashImageUrl: `${ROOT_URL}/logo-farcaster.png`,
    splashBackgroundColor: "#8b5cf6",
    webhookUrl: `${ROOT_URL}/api/webhook`,
    subtitle: "Daily guessing games",
    description: "Daily guess characters from famous games, movies, TV shows, and more",
    primaryCategory: "games",
    screenshotUrls: [`${ROOT_URL}/preview.jpg`],
    heroImageUrl: `${ROOT_URL}/hero-banner.jpg`,
    tags: ["game", "daily", "guessing", "quizzdle", "onchain"],
    ogDescription: "Daily guessing games",
    ogImageUrl: `${ROOT_URL}/logo-farcaster.png`,
    ogTitle: "Quizzdle Onchain",
  },
} as const;

