"use client";
import { useEffect } from "react";

export function OnchainKitStyles() {
  useEffect(() => {
    // Charger le CSS d'OnchainKit dynamiquement pour éviter le traitement PostCSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/onchainkit.css";
    document.head.appendChild(link);

    return () => {
      // Nettoyer lors du démontage
      const existingLink = document.querySelector('link[href="/onchainkit.css"]');
      if (existingLink) {
        existingLink.remove();
      }
    };
  }, []);

  return null;
}
