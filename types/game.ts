/**
 * Types pour le jeu Dailydle
 */

export interface Attribute {
  name: string;
  nameFront: string; // Nom affiché à l'utilisateur
  type: "string" | "array" | "int" | "bool";
}

export interface Character {
  id: number;
  name: string;
  imageUrl?: string;
  attributes: Record<string, string | string[] | number>; // Ex: { gender: "Masculin", position: ["Haut"], releaseYear: 2013 }
}

export interface Collection {
  id: number;
  name: string;
  color?: string;
  bgImage?: string;
  attributes: Attribute[];
  characters: Character[];
}

export interface AttributeComparison {
  attributeName: string;
  attributeNameFront: string;
  guessValue: string | string[] | number;
  correctValue: string | string[] | number;
  isCorrect: boolean;
  isPartial?: boolean; // Pour les arrays, si une partie correspond
}

export interface GuessResult {
  isCorrect: boolean;
  attempts: number;
  characterId: number;
  characterName: string;
  comparisons: AttributeComparison[];
  timestamp: number;
}

export interface GameState {
  collectionId: number;
  dailyCharacter: Character | null;
  dailyCharacterHash: string;
  attempts: number;
  maxAttempts: number;
  guesses: GuessResult[];
  isGameOver: boolean;
  isGameWon: boolean;
}

export interface ContractCollection {
  id: bigint;
  name: string;
  dailyCharacterHash: string;
  lastUpdateDay: bigint;
}

export interface ContractCharacter {
  id: bigint;
  collectionId: bigint;
  name: string;
  attributesHash: string;
}

export interface ContractGuess {
  player: string;
  collectionId: bigint;
  characterId: bigint;
  timestamp: bigint;
  isCorrect: boolean;
}
