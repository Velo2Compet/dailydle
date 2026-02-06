"use client";

import { useEffect, useState } from "react";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import Link from "next/link";
import type { QuizzdleCategoryRef } from "@/lib/quizzdle-api";
import { quizzdleImageUrl } from "@/lib/quizzdle-api";
import styles from "@/app/page.module.css";
import { StatsHeader } from "./StatsHeader";

interface CategoriesViewProps {
  categories: QuizzdleCategoryRef[];
}

export function CategoriesView({ categories }: CategoriesViewProps) {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [setFrameReady, isFrameReady]);

  const filteredCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <StatsHeader />
      <main className={styles.mainContainer}>
        <div className={styles.categoriesWrapper}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", justifyContent: "space-between" }}>
            <h1 className={styles.sectionTitle}>Catégories</h1>
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid rgba(168, 85, 247, 0.3)",
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                color: "white",
                fontSize: "1rem",
              }}
            />
          </div>
        {filteredCategories.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Aucune collection disponible.</p>
          </div>
        ) : (
          <div className={styles.categoryGrid}>
            {filteredCategories.map((cat) => (
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
