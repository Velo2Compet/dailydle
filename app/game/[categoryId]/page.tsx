import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchCategoryById } from "@/lib/quizzdle-api";
import { quizzdleCategoryToCollection } from "@/utils/quizzdle-transform";
import { GameBoard } from "@/components/GameBoard";
import styles from "../page.module.css";

interface PageProps {
  params: Promise<{ categoryId: string }>;
}

interface FetchError extends Error {
  status?: number;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoryId } = await params;
  const id = parseInt(categoryId, 10);
  if (Number.isNaN(id) || id < 1) {
    return { title: "Game – Dailydle" };
  }
  try {
    const raw = await fetchCategoryById(id);
    const name = raw?.name ?? "Game";
    return {
      title: `${name} – Dailydle`,
      description: `Guess the daily character in ${name}.`,
    };
  } catch {
    return { title: "Game – Dailydle" };
  }
}

export default async function GameCategoryPage({ params }: PageProps) {
  const { categoryId } = await params;
  const id = parseInt(categoryId, 10);
  if (Number.isNaN(id) || id < 1) notFound();

  let collection;
  try {
    const raw = await fetchCategoryById(id);
    collection = quizzdleCategoryToCollection(raw);
  } catch (e) {
    const err = e as FetchError;
    const m = err.message?.match(/: (\d{3}) /);
    const status = err.status ?? (m ? Number(m[1]) : undefined);
    if (status === 401 || status === 403) {
      return (
        <div className={styles.container}>
          <div className={styles.error}>
            <p>Clé API Quizzdle manquante ou invalide.</p>
            <p>Ajoutez <code>QUIZZDLE_API_KEY</code> dans <code>.env.local</code> puis redémarrez.</p>
            <Link href="/">← Retour à l&apos;accueil</Link>
          </div>
        </div>
      );
    }
    if (process.env.NODE_ENV === "development") {
      console.error("Quizzdle API category:", err.message);
    }
    notFound();
  }

  if (
    !collection ||
    !collection.characters ||
    collection.characters.length === 0
  ) {
    notFound();
  }

  return (
    <div className={styles.container}>
      <GameBoard collection={collection} />
    </div>
  );
}
