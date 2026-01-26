"use client";

import { useEffect, useState, useMemo } from "react";
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
  const [search, setSearch] = useState("");

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const query = search.toLowerCase();
    return categories.filter((cat) =>
      cat.name.toLowerCase().includes(query)
    );
  }, [categories, search]);

  useEffect(() => {
    if (!isFrameReady) setFrameReady();
  }, [setFrameReady, isFrameReady]);

  return (
    <div className={styles.container}>
      <StatsHeader />
      <main className={styles.mainContainer}>
        {/* GM Streak Card */}
        <div className="py-4">
          <GmStreakCard />
        </div>

        <div id="categories" className={styles.categoriesWrapper}>
          {/* Header with title and search */}
          <div className="flex items-center justify-between gap-4 my-4">
            <h2 className="text-xl font-bold text-white">Games</h2>
            <div className="relative">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-40 sm:w-56 px-4 py-2 pl-10 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:border-violet-500/50 transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {filteredCategories.length === 0 ? (
            <div className={styles.emptyState}>
              <p>{search ? "No results found." : "No collections available."}</p>
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
