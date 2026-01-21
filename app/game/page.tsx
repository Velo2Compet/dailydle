"use client";
import { useState, useEffect } from "react";
import { GameBoard } from "@/components/GameBoard";
import { Collection } from "@/types/game";
import testCollections from "@/data/test-collections.json";

export default function GamePage() {
  const [collection, setCollection] = useState<Collection | null>(null);

  useEffect(() => {
    // Charger la première collection de test
    if (testCollections.length > 0) {
      const firstCollection = testCollections[0] as Collection;
      // Vérifier que la collection a des personnages
      if (firstCollection && firstCollection.characters && firstCollection.characters.length > 0) {
        // Utiliser l'ID de la collection depuis le JSON (doit correspondre à celui initialisé dans le contrat)
        setCollection(firstCollection);
      }
    }
  }, []);

  if (!collection) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full">
        <div className="w-full max-w-2xl mx-auto px-4">
          <div className="w-full relative bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl shadow-xl shadow-violet-500/10 p-12">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-blue-500/5 to-violet-500/5 pointer-events-none rounded-2xl"></div>
            <div className="relative z-10 text-center">
              <h2 className="text-3xl md:text-4xl mb-4 font-black tracking-tight">
                <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Initialisation...
                </span>
              </h2>
              <p className="text-muted-foreground text-lg">Chargement de l'application...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <GameBoard collection={collection} />;
}
