import type { Collection } from "@/types/game";
import { normalizeCharacter } from "./game";
import type {
  QuizzdleCategoryFull,
  QuizzdleAttribute,
  QuizzdleCharacter,
} from "@/lib/quizzdle-api";
import { quizzdleImageUrl } from "@/lib/quizzdle-api";

/**
 * Transforme une catégorie Quizzdle (API) en Collection Dailydle.
 */
export function quizzdleCategoryToCollection(
  raw: QuizzdleCategoryFull
): Collection {
  const attrs = raw.attributes ?? raw.attributs ?? [];
  const chars = raw.characters ?? raw.personnages ?? [];

  // Créer un mapping id -> attribut pour transformer les personnages
  const attrById = new Map<number, QuizzdleAttribute>();
  attrs.forEach((a: QuizzdleAttribute) => {
    if (a.id !== undefined) {
      attrById.set(a.id, a);
    }
  });

  const attributes = attrs.map((a: QuizzdleAttribute) => ({
    name: a.name,
    nameFront: a.nameFront ?? a.name,
    type: (a.type ?? "string") as "string" | "array" | "int" | "bool",
  }));

  const characters = chars.map((c: QuizzdleCharacter) => {
    const img = c.imageUrl ?? c.picture;

    // Transformer le tableau attributs en objet { name: value }
    const charAttributes: Record<string, string | number | string[]> = {};

    if (c.attributs && Array.isArray(c.attributs)) {
      // Grouper les valeurs par attribut_id (pour les attributs multi-valeurs comme Région)
      const valuesByAttrId = new Map<number, (string | number)[]>();

      for (const attr of c.attributs) {
        const existing = valuesByAttrId.get(attr.attribut_id) || [];
        existing.push(attr.value);
        valuesByAttrId.set(attr.attribut_id, existing);
      }

      // Convertir en objet avec les noms d'attributs
      for (const [attrId, values] of valuesByAttrId) {
        const attrDef = attrById.get(attrId);
        if (attrDef) {
          // Si plusieurs valeurs, créer un tableau de strings, sinon une valeur simple
          if (values.length === 1) {
            charAttributes[attrDef.name] = values[0];
          } else {
            charAttributes[attrDef.name] = values.map(v => String(v));
          }
        }
      }
    }

    return normalizeCharacter({
      ...c,
      ...charAttributes,
      imageUrl: img ? quizzdleImageUrl(img) : undefined,
    });
  });

  return {
    id: raw.id,
    name: raw.name,
    slug: raw.slug ?? undefined,
    color: raw.color ?? undefined,
    bgImage: raw.bgImage ?? raw.background_image ?? undefined,
    attributes,
    characters,
  };
}
