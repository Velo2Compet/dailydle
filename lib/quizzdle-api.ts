/**
 * Client API Quizzdle – appels serveur uniquement (utilise QUIZZDLE_API_KEY).
 * Base: https://quizzdle.fr/api/public
 * Routes: parent-categories, categories/{id}
 */

const NEXT_PUBLIC_QUIZZDLE_API_URL =
  process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "";
const BASE = `${NEXT_PUBLIC_QUIZZDLE_API_URL}/api/public`;
// Nettoyer la clé API de tout caractère invisible/non-ASCII
const API_KEY = (process.env.QUIZZDLE_API_KEY ?? "").trim().replace(/[^\x20-\x7E]/g, "");

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
 * GET /api/public/categories
 * Liste plate de toutes les catégories.
 * En cas d'erreur ou d'API indisponible, retourne [].
 */
export async function fetchCategories(): Promise<QuizzdleCategoryRef[]> {
  try {
    const res = await fetch(`${BASE}/categories`, { headers: headers() });
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`Quizzdle API categories: ${res.status}`);
      }
      return [];
    }
    const data = await res.json();
    const raw = Array.isArray(data) ? data : data?.data ?? data?.categories ?? [];
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Quizzdle API categories:", e);
    }
    return [];
  }
}

/**
 * GET /api/public/parent-categories
 * Liste des catégories parentes avec leurs catégories enfants.
 * En cas d'erreur (404, 500, etc.) ou d'API indisponible, retourne [].
 */
export async function fetchCategoriesParent(): Promise<QuizzdleParentCategory[]> {
  try {
    const res = await fetch(`${BASE}/parent-categories`, { headers: headers() });
    if (!res.ok) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`Quizzdle API parent-categories: ${res.status}`);
      }
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : data.data ?? data.categories ?? [];
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Quizzdle API parent-categories:", e);
    }
    return [];
  }
}

/**
 * GET /api/public/categories/{id}
 * Détail d'une catégorie (attributs, personnages) pour le jeu.
 * cache: 'no-store' pour toujours avoir des données à jour à l'ouverture d'une partie.
 * @throws Error avec message contenant le status (ex. "401") si !res.ok
 */
export async function fetchCategoryById(
  id: number | string
): Promise<QuizzdleCategoryFull> {
  // ?q=all récupère tous les personnages de la catégorie côté serveur
  const res = await fetch(`${BASE}/categories/${id}?q=all`, {
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
