"use client";

import { useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Link from "next/link";
import { StatsHeader } from "@/components/StatsHeader";
import { GmStreakCard } from "@/components/GmStreakCard";
import type { QuizzdleCategoryRef } from "@/lib/quizzdle-api";
import { quizzdleImageUrl } from "@/lib/quizzdle-api";
import styles from "@/app/page.module.css";

interface HomeViewProps {
  categories: QuizzdleCategoryRef[];
}

export function HomeView({ categories }: HomeViewProps) {
  const { isFrameReady, setFrameReady } = useMiniKit();

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [setFrameReady, isFrameReady]);

  return (
    <div className={styles.container}>
      <StatsHeader />
      <main className={styles.mainContainer}>
        {/* GM Streak Card */}
        <div className="pb-4">
          <GmStreakCard />
        </div>

        <div id="categories" className={styles.categoriesWrapper}>
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
                        alt={cat.name}
                        className={styles.categoryCardImage}
                      />
                    ) : (
                      <p className={styles.categoryCardNameOnly}>
                        {cat.name}
                      </p>
                    )}
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
