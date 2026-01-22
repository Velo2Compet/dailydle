"use client";

import { useEffect } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Link from "next/link";
import { GameHeader } from "@/components/GameHeader";
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
      <GameHeader className={styles.homeHeader} />
      <main className={styles.mainContainer}>
        <section className={styles.seoSection}>
          <div id="homepage-seo-card" className={styles.seoCard}>
            <div className={styles.seoCardOverlay} />
            <div className={styles.seoCardContent}>
              <h1 className={styles.seoTitle}>
                <img src="/logo.png" alt="Dailydle" className={styles.logo} />
                <span className={styles.seoTitleGradient}>
                  Guess the character of the day
                </span>
              </h1>
              <div className={styles.seoText}>
                <p>
                  Dailydle is a daily guessing game: find the mystery character
                  from your clues and comparisons.
                </p>
                <p>
                  Pick a collection, make guesses, and use the hints to narrow it
                  down.
                </p>
                <p>Observe, deduce, and win.</p>
              </div>
              <a href="#categories" className={styles.ctaLink}>
                <span>Choisir une catégorie</span>
                <svg
                  className={styles.ctaArrow}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </a>
            </div>
          </div>
        </section>

        <div id="categories" className={styles.categoriesWrapper}>
          <h2 className={styles.sectionTitle}>Catégories</h2>
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
                        cat.image
                          ? styles.categoryCardName
                          : styles.categoryCardNameOnly
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
