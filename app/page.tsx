"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMiniKit } from "@coinbase/onchainkit/minikit";

export default function Home() {
  const { isFrameReady, setFrameReady } = useMiniKit();
  const router = useRouter();

  // Initialize the miniapp
  useEffect(() => {
    if (!isFrameReady) {
      setFrameReady();
    }
  }, [setFrameReady, isFrameReady]);

  // Rediriger vers la page de jeu
  useEffect(() => {
    router.push("/game");
  }, [router]);

  return (
    <div style={{ 
      display: "flex", 
      justifyContent: "center", 
      alignItems: "center", 
      minHeight: "100vh" 
    }}>
      <p>Redirection vers le jeu...</p>
    </div>
  );
}
