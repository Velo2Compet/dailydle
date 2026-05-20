"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StatsHeader } from "@/components/StatsHeader";
import { GmStreakCard } from "@/components/GmStreakCard";
import { Footer } from "@/components/Footer";
import type {
  QuizzdleCategoryRef,
  QuizzdleParentCategory,
} from "@/lib/quizzdle-api";
import { quizzdleImageUrl } from "@/lib/quizzdle-api";
import styles from "@/app/page.module.css";

interface HomeViewProps {
  categories: QuizzdleCategoryRef[];
  parents?: QuizzdleParentCategory[];
}

export function HomeView({ categories, parents = [] }: HomeViewProps) {
  const [search, setSearch] = useState("");
  const [selectedParentId, setSelectedParentId] = useState<number | null>(null);

  // Map each visible category id to the parent(s) it belongs to.
  // A category can appear under multiple parents in the catalogue, so we use a Set.
  const parentIdsByCategory = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const p of parents) {
      for (const c of p.categories ?? []) {
        const set = map.get(c.id) ?? new Set<number>();
        set.add(p.id);
        map.set(c.id, set);
      }
    }
    return map;
  }, [parents]);

  // Only show filter chips for parents that have at least one registered (visible) game.
  const visibleParents = useMemo(() => {
    const visibleIds = new Set(categories.map((c) => c.id));
    return parents.filter((p) =>
      (p.categories ?? []).some((c) => visibleIds.has(c.id))
    );
  }, [parents, categories]);

  // If the active filter no longer has any visible game (e.g. catalogue changed),
  // drop it so the grid doesn't appear empty for a stale reason.
  useEffect(() => {
    if (selectedParentId === null) return;
    if (!visibleParents.some((p) => p.id === selectedParentId)) {
      setSelectedParentId(null);
    }
  }, [visibleParents, selectedParentId]);

  // Filter chips carousel — show arrows when there is content to scroll to.
  const chipsScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    // 4px tolerance avoids the arrow flickering when the user lands a hair shy of either edge.
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = chipsScrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, visibleParents.length]);

  const scrollChips = (delta: number) => {
    chipsScrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories.filter((cat) => {
      if (selectedParentId !== null) {
        const parentSet = parentIdsByCategory.get(cat.id);
        if (!parentSet || !parentSet.has(selectedParentId)) return false;
      }
      if (query && !cat.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [categories, search, selectedParentId, parentIdsByCategory]);

  return (
    <div className={styles.container}>
      <StatsHeader />
      <main className={styles.mainContainer}>
        {/* GM Streak Card */}
        <div className="py-4">
          <GmStreakCard />
        </div>

        <div id="categories" className={styles.categoriesWrapper}>
          {/* Header with title, parent filters and search */}
          <div className="flex items-center gap-3 my-4">
            <h2 className="text-xl font-bold text-white shrink-0">Games</h2>
            {visibleParents.length > 0 && (
              <div className="relative flex-1 min-w-0">
                <div
                  ref={chipsScrollRef}
                  className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedParentId(null)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedParentId === null
                        ? "bg-violet-500/20 border-violet-500/50 text-white"
                        : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:border-white/20"
                    }`}
                  >
                    All
                  </button>
                  {visibleParents.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedParentId(p.id)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        selectedParentId === p.id
                          ? "bg-violet-500/20 border-violet-500/50 text-white"
                          : "bg-white/5 border-white/10 text-white/70 hover:text-white hover:border-white/20"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>

                {/* Fade + arrow: left */}
                <div
                  className={`pointer-events-none absolute inset-y-0 left-0 flex items-center pr-6 bg-gradient-to-r from-[#0f0f1a] via-[#0f0f1a]/80 to-transparent transition-opacity ${
                    canScrollLeft ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <button
                    type="button"
                    aria-label="Scroll filters left"
                    onClick={() => scrollChips(-160)}
                    className="pointer-events-auto w-7 h-7 rounded-full flex items-center justify-center bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>

                {/* Fade + arrow: right */}
                <div
                  className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end pl-6 bg-gradient-to-l from-[#0f0f1a] via-[#0f0f1a]/80 to-transparent transition-opacity ${
                    canScrollRight ? "opacity-100" : "opacity-0"
                  }`}
                >
                  <button
                    type="button"
                    aria-label="Scroll filters right"
                    onClick={() => scrollChips(160)}
                    className="pointer-events-auto w-7 h-7 rounded-full flex items-center justify-center bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
            <div className="relative shrink-0 ml-auto">
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-32 sm:w-56 px-4 py-2 pl-10 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/40 focus:outline-none focus:border-violet-500/50 transition-colors"
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
      <Footer />
    </div>
  );
}
