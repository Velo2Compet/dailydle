/**
 * Client API Quizzdle – appels serveur uniquement (utilise QUIZZDLE_API_KEY).
 * Base: https://quizzdle.com/api/public
 * Routes: categories, parent-categories, categories/{id}
 *
 * Language: we pass ?lang=en everywhere. The backend supports a `lang` query
 * param (default "fr") and falls back to the main language (fr) row-by-row
 * when an English translation row is missing — so requesting `en` is safe
 * regardless of how much of the EN catalogue is actually translated.
 *
 * Pagination: the listing endpoints cap at limit=50 server-side. We request
 * the max and iterate `total_pages` when there is more, so callers never
 * have to think about paging.
 */

const NEXT_PUBLIC_QUIZZDLE_API_URL =
  process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "";
const BASE = `${NEXT_PUBLIC_QUIZZDLE_API_URL}/api/public`;
// Nettoyer la clé API de tout caractère invisible/non-ASCII
const API_KEY = (process.env.QUIZZDLE_API_KEY ?? "").trim().replace(/[^\x20-\x7E]/g, "");

const DEFAULT_LANG = "en";
const PAGE_LIMIT = 50; // server cap; values higher are clamped

interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

function headers(): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (API_KEY) {
    h["x-api-key"] = API_KEY;
  }
  return h;
}

export interface QuizzdleCategoryRef {
  id: number;
  name: string;
  slug: string;
  image?: string;
}

export interface QuizzdleParentCategory {
  id: number;
  name: string;
  slug: string;
  image?: string;
  categories: QuizzdleCategoryRef[];
}

export interface QuizzdleAttribute {
  id?: number;
  name: string;
  nameFront?: string;
  type: string;
}

export interface QuizzdleCharacterAttribut {
  attribut_id: number;
  value: string | number;
}

export interface QuizzdleCharacter {
  id: number;
  name: string;
  imageUrl?: string;
  picture?: string;
  attributs?: QuizzdleCharacterAttribut[];
  [key: string]: unknown;
}

export interface QuizzdleCategoryFull {
  id: number;
  name: string;
  slug: string;
  image?: string;
  color?: string;
  bgImage?: string;
  background_image?: string;
  attributes?: QuizzdleAttribute[];
  attributs?: QuizzdleAttribute[];
  characters?: QuizzdleCharacter[];
  personnages?: QuizzdleCharacter[];
}

/**
 * Fetch a single paginated page. Returns the items and the pagination block
 * so a caller can decide whether to keep iterating.
 */
async function fetchPage<T>(
  url: string
): Promise<{ items: T[]; pagination: ApiPagination | null }> {
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw Object.assign(new Error(`Quizzdle API ${url}: ${res.status}`), {
      status: res.status,
    });
  }
  const data = await res.json();
  const items: T[] = Array.isArray(data)
    ? data
    : (data?.data ?? data?.categories ?? []);
  const pagination = data && typeof data === "object" ? (data.pagination as ApiPagination | undefined) ?? null : null;
  return { items: Array.isArray(items) ? items : [], pagination };
}

/**
 * Drain every page of a paginated listing endpoint. Pages 2..N are fetched
 * in parallel — server cap is 50/page and current catalogue is ~40 items,
 * so realistically this is one round trip; we just don't want to silently
 * truncate when the catalogue grows past 50.
 */
async function fetchAllPages<T>(buildUrl: (page: number) => string): Promise<T[]> {
  const first = await fetchPage<T>(buildUrl(1));
  const totalPages = first.pagination?.total_pages ?? 1;
  if (totalPages <= 1) return first.items;

  const restUrls: string[] = [];
  for (let p = 2; p <= totalPages; p++) restUrls.push(buildUrl(p));

  const rest = await Promise.all(restUrls.map((u) => fetchPage<T>(u)));
  return first.items.concat(...rest.map((r) => r.items));
}

/**
 * GET /api/public/categories?lang=en&limit=50&page=…
 * Liste plate de toutes les catégories, toutes pages confondues, en anglais
 * (fallback FR par row si traduction manquante côté backend).
 * En cas d'erreur ou d'API indisponible, retourne [].
 */
export async function fetchCategories(
  lang: string = DEFAULT_LANG
): Promise<QuizzdleCategoryRef[]> {
  try {
    return await fetchAllPages<QuizzdleCategoryRef>(
      (page) => `${BASE}/categories?lang=${lang}&limit=${PAGE_LIMIT}&page=${page}`
    );
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Quizzdle API categories:", e);
    }
    return [];
  }
}

/**
 * GET /api/public/parent-categories?lang=en&limit=50&page=…
 * Liste des catégories parentes avec leurs catégories enfants.
 * En cas d'erreur (404, 500, etc.) ou d'API indisponible, retourne [].
 */
export async function fetchCategoriesParent(
  lang: string = DEFAULT_LANG
): Promise<QuizzdleParentCategory[]> {
  try {
    return await fetchAllPages<QuizzdleParentCategory>(
      (page) => `${BASE}/parent-categories?lang=${lang}&limit=${PAGE_LIMIT}&page=${page}`
    );
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Quizzdle API parent-categories:", e);
    }
    return [];
  }
}

/**
 * GET /api/public/categories/{id}?lang=en&q=all
 * Détail d'une catégorie (attributs, personnages) pour le jeu.
 * cache: 'no-store' pour toujours avoir des données à jour à l'ouverture d'une partie.
 * @throws Error avec message contenant le status (ex. "401") si !res.ok
 */
export async function fetchCategoryById(
  id: number | string,
  lang: string = DEFAULT_LANG
): Promise<QuizzdleCategoryFull> {
  // ?q=all récupère tous les personnages de la catégorie côté serveur
  const res = await fetch(`${BASE}/categories/${id}?lang=${lang}&q=all`, {
    headers: headers(),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`Quizzdle API categories/${id}: ${res.status}`, text.slice(0, 200));
    }
    const err = new Error(`Quizzdle API categories/${id}: ${res.status} ${text}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Quizzdle API categories/${id}: invalid JSON`);
  }
  const raw = (data as { data?: QuizzdleCategoryFull })?.data ?? (data as QuizzdleCategoryFull);
  return raw as QuizzdleCategoryFull;
}

/**
 * Liste plate de toutes les catégories (enfants des parents), dédupliquée par id.
 */
export function flattenCategories(
  parents: QuizzdleParentCategory[]
): QuizzdleCategoryRef[] {
  const byId = new Map<number, QuizzdleCategoryRef>();
  for (const p of parents) {
    for (const c of p.categories ?? []) {
      byId.set(c.id, c);
    }
  }
  return Array.from(byId.values());
}

/**
 * Préfixe pour les images relatives Quizzdle.
 */
export function quizzdleImageUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  const base = NEXT_PUBLIC_QUIZZDLE_API_URL.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.startsWith("/img") ? `${base}${p}` : `${base}/img${p.startsWith("/") ? "" : "/"}${p}`;
}

/**
 * Filter categories to only include those registered in the smart contract.
 * This prevents showing games that would fail with "Collection does not exist".
 */
export async function filterRegisteredCollections(
  categories: QuizzdleCategoryRef[]
): Promise<QuizzdleCategoryRef[]> {
  if (categories.length === 0) return [];

  const { createPublicClient, http, parseAbi } = await import("viem");
  const { APP_CHAIN, RPC_URL } = await import("@/lib/chain-config");

  const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    console.warn("Contract address not configured, showing all categories");
    return categories;
  }

  const abi = parseAbi([
    "function collectionExists(uint256 _collectionId) external view returns (bool)",
  ]);

  const client = createPublicClient({
    chain: APP_CHAIN,
    transport: http(RPC_URL),
  });

  // Check all collections in parallel
  const results = await Promise.all(
    categories.map(async (cat) => {
      try {
        const exists = await client.readContract({
          address: CONTRACT_ADDRESS,
          abi,
          functionName: "collectionExists",
          args: [BigInt(cat.id)],
        });
        return { cat, exists };
      } catch (error) {
        console.warn(`Failed to check collection ${cat.id}:`, error);
        return { cat, exists: false };
      }
    })
  );

  const registered = results.filter((r) => r.exists).map((r) => r.cat);

  if (registered.length < categories.length) {
    const missing = categories.filter((c) => !registered.find((r) => r.id === c.id));
    console.log(
      `[Collections] ${registered.length}/${categories.length} registered. Missing: ${missing.map((c) => c.id).join(", ")}`
    );
  }

  return registered;
}
