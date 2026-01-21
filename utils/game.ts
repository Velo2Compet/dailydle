import { Collection, Character, AttributeComparison, GuessResult } from "@/types/game";
import { keccak256, toBytes, stringToBytes } from "viem";

/**
 * Normalise un personnage pour avoir une structure cohérente
 * Les attributs peuvent être directement sur l'objet ou dans character.attributes
 */
function normalizeCharacter(character: any): Character {
  const excludeKeys = ['id', 'name', 'imageUrl'];
  const attributes: Record<string, string | string[] | number> = {};
  
  // Si character.attributes existe et est un objet, l'utiliser
  if (character.attributes && typeof character.attributes === 'object' && !Array.isArray(character.attributes)) {
    Object.assign(attributes, character.attributes);
  } else {
    // Sinon, extraire directement depuis l'objet personnage
    for (const key in character) {
      if (!excludeKeys.includes(key) && key !== 'attributes') {
        attributes[key] = character[key];
      }
    }
  }
  
  return {
    id: character.id,
    name: character.name,
    imageUrl: character.imageUrl,
    attributes,
  };
}

/**
 * Détermine le personnage du jour basé sur la date et l'ID de la collection
 * Utilise un seed déterministe pour garantir le même personnage pour tous les joueurs le même jour
 */
export function getDailyCharacter(
  collection: Collection,
  date?: Date
): Character | null {
  if (!collection || !collection.characters || collection.characters.length === 0) {
    return null;
  }

  const targetDate = date || new Date();
  const dayOfYear = Math.floor(
    (targetDate.getTime() - new Date(targetDate.getFullYear(), 0, 0).getTime()) /
      86400000
  );
  
  // Seed déterministe : année + jour de l'année + ID de la collection
  const seed = targetDate.getFullYear() * 1000 + dayOfYear + collection.id * 10000;
  
  // Sélectionner un personnage de manière déterministe
  const characterIndex = seed % collection.characters.length;
  const rawCharacter = collection.characters[characterIndex];
  return normalizeCharacter(rawCharacter);
}

/**
 * Hash les attributs d'un personnage pour comparaison on-chain
 */
export function hashCharacter(character: Character | null): string {
  if (!character) {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // Normaliser le personnage pour avoir une structure cohérente
  const normalized = normalizeCharacter(character);
  
  if (!normalized.attributes || Object.keys(normalized.attributes).length === 0) {
    return "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // Créer une chaîne représentant tous les attributs de manière ordonnée
  const attributesString = Object.keys(normalized.attributes)
    .sort()
    .map((key) => {
      const value = normalized.attributes[key];
      if (Array.isArray(value)) {
        return `${key}:${value.sort().join(",")}`;
      }
      return `${key}:${value}`;
    })
    .join("|");
  
  // Hash avec keccak256 (compatible avec Solidity)
  const hash = keccak256(stringToBytes(attributesString));
  return hash;
}

/**
 * Compare les attributs d'un personnage deviné avec le personnage correct
 * Retourne un tableau de comparaisons pour chaque attribut
 */
export function compareAttributes(
  guessCharacter: Character,
  correctCharacter: Character,
  attributes: Array<{ name: string; nameFront: string; type: string }>
): AttributeComparison[] {
  // Normaliser les personnages pour avoir une structure cohérente
  const normalizedGuess = normalizeCharacter(guessCharacter);
  const normalizedCorrect = normalizeCharacter(correctCharacter);
  
  return attributes.map((attr) => {
    const guessValue = normalizedGuess.attributes[attr.name];
    const correctValue = normalizedCorrect.attributes[attr.name];
    
    let isCorrect = false;
    let isPartial = false;
    
    if (attr.type === "array") {
      const guessArray = Array.isArray(guessValue) ? guessValue : [guessValue];
      const correctArray = Array.isArray(correctValue) ? correctValue : [correctValue];
      
      // Vérifier si tous les éléments correspondent
      const guessSet = new Set(guessArray.map((v) => String(v).toLowerCase()));
      const correctSet = new Set(correctArray.map((v) => String(v).toLowerCase()));
      
      isCorrect =
        guessSet.size === correctSet.size &&
        [...guessSet].every((v) => correctSet.has(v));
      
      // Vérifier si au moins un élément correspond (partiel)
      isPartial = !isCorrect && [...guessSet].some((v) => correctSet.has(v));
    } else if (attr.type === "int") {
      isCorrect = Number(guessValue) === Number(correctValue);
    } else {
      // String ou bool
      isCorrect =
        String(guessValue).toLowerCase() === String(correctValue).toLowerCase();
    }
    
    return {
      attributeName: attr.name,
      attributeNameFront: attr.nameFront,
      guessValue,
      correctValue,
      isCorrect,
      isPartial: attr.type === "array" ? isPartial : undefined,
    };
  });
}

/**
 * Formate une valeur d'attribut pour l'affichage
 */
export function formatAttributeValue(
  value: string | string[] | number
): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return String(value);
}

/**
 * Calcule le jour actuel (nombre de jours depuis l'epoch)
 */
export function getCurrentDay(): number {
  return Math.floor(Date.now() / 86400000);
}

/**
 * Génère un seed pour la sélection du personnage du jour
 */
export function generateDailySeed(collectionId: number, day: number): number {
  return day * 1000 + collectionId;
}
