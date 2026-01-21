"use client";
import { AttributeComparison as AttributeComparisonType } from "@/types/game";
import { formatAttributeValue } from "@/utils/game";
import styles from "./AttributeComparison.module.css";

interface AttributeComparisonProps {
  comparisons: AttributeComparisonType[];
  characterName?: string;
  characterImage?: string;
}

export function AttributeComparison({ 
  comparisons, 
  characterName,
  characterImage 
}: AttributeComparisonProps) {
  const getStatusClass = (comparison: AttributeComparisonType) => {
    if (comparison.isCorrect) return styles.correct;
    if (comparison.isPartial) return styles.partial;
    return styles.incorrect;
  };

  const getArrow = (comparison: AttributeComparisonType) => {
    if (comparison.isCorrect) return "";
    // Pour les valeurs numériques, afficher ↑ ou ↓
    if (typeof comparison.guessValue === "number" && typeof comparison.correctValue === "number") {
      if (comparison.guessValue > comparison.correctValue) return "↓";
      if (comparison.guessValue < comparison.correctValue) return "↑";
    }
    return "";
  };

  return (
    <div className={styles.container}>
      <table className={styles.attributesTable}>
        <thead>
          <tr>
            <th className={styles.attributeCell}>Personnage</th>
            {comparisons.map((comparison, index) => (
              <th key={index} className={styles.attributeCell}>
                {comparison.attributeNameFront}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className={styles.attributeRow}>
            <td className={styles.attributeCell}>
              {characterImage && (
                <div className={styles.characterCell}>
                  <img 
                    src={characterImage} 
                    alt={characterName || "Character"} 
                    className={styles.characterImage}
                  />
                  <span className={styles.characterName}>{characterName}</span>
                </div>
              )}
              {!characterImage && characterName && (
                <span className={styles.characterName}>{characterName}</span>
              )}
            </td>
            {comparisons.map((comparison, index) => {
              const statusClass = getStatusClass(comparison);
              const arrow = getArrow(comparison);
              return (
                <td key={index} className={styles.attributeCell}>
                  <div className={`${styles.value} ${statusClass}`}>
                    {formatAttributeValue(comparison.guessValue)}
                    {arrow && <span className={styles.arrow}>{arrow}</span>}
                  </div>
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
