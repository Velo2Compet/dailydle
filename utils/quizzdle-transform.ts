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

  const attributes = attrs.map((a: QuizzdleAttribute) => ({
    name: a.name,
    nameFront: a.nameFront ?? a.name,
    type: (a.type ?? "string") as "string" | "array" | "int" | "bool",
  }));

  const characters = chars.map((c: QuizzdleCharacter) => {
    const img = c.imageUrl ?? c.picture;
    return normalizeCharacter({
      ...c,
      imageUrl: img ? quizzdleImageUrl(img) : undefined,
    });
  });

  return {
    id: raw.id,
    name: raw.name,
    color: raw.color ?? undefined,
    bgImage: raw.bgImage ?? raw.background_image ?? undefined,
    attributes,
    characters,
  };
}
