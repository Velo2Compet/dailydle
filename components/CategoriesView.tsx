"use client";

import { useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Link from "next/link";
import { GameHeader } from "@/components/GameHeader";
import type { QuizzdleCategoryRef } from "@/lib/quizzdle-api";
import { quizzdleImageUrl } from "@/lib/quizzdle-api";
import styles from "@/app/page.module.css";

interface CategoriesViewProps {
  categories: QuizzdleCategoryRef[];
}

export function CategoriesView({ categories }: CategoriesViewProps) {
  const { isFrameReady, setFrameReady } = useMiniKit();

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [setFrameReady, isFrameReady]);

  return (
    <div className={styles.container}>
      <GameHeader className={styles.homeHeader} />
      <main className={styles.mainContainer}>
        <div className={styles.categoriesWrapper}>
          <h1 className={styles.sectionTitle}>Catégories</h1>
        {categories.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Aucune collection disponible.</p>
          </div>
        ) : (
          <div className={styles.categoryGrid}>
            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/game/${cat.id}`}
                className={styles.categoryCard}
              >
                <div className={styles.categoryCardOverlay} />
                <div className={styles.categoryCardInner}>
                  {cat.image ? (
                    <img
                      src={quizzdleImageUrl(cat.image)}
                      alt=""
                      className={styles.categoryCardImage}
                    />
                  ) : null}
                  <p
                    className={
                      cat.image ? styles.categoryCardName : styles.categoryCardNameOnly
                    }
                  >
                    {cat.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
