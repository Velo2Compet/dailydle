"use client";
import { useRef, useEffect } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { Button } from "./Button";

/**
 * Composant qui wrap le Wallet d'OnchainKit avec le style du Button
 * Le Wallet affiche un modal avec tous les wallets disponibles
 */
export function WalletButton({ size = "md", fullWidth = false, className = "" }: { size?: "sm" | "md" | "lg"; fullWidth?: boolean; className?: string }) {
  const walletRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trouver et cacher le bouton Wallet après le rendu
    const findAndHideWalletButton = () => {
      if (walletRef.current) {
        // Chercher tous les boutons dans le conteneur Wallet
        const buttons = walletRef.current.querySelectorAll('button');
        buttons.forEach((button) => {
          // Cacher complètement le bouton Wallet original
          button.style.cssText = 'display: none !important; visibility: hidden !important; position: absolute !important; opacity: 0 !important; pointer-events: none !important; width: 0 !important; height: 0 !important;';
        });
        
        // Cacher aussi les divs qui pourraient contenir le bouton
        const walletContainers = walletRef.current.querySelectorAll('[data-testid="ockWalletButton"], [data-onchainkit="wallet-button"]');
        walletContainers.forEach((container) => {
          (container as HTMLElement).style.cssText = 'display: none !important;';
        });
      }
    };
    
    // Essayer plusieurs fois car le Wallet peut se rendre de manière asynchrone
    const timeout1 = setTimeout(findAndHideWalletButton, 50);
    const timeout2 = setTimeout(findAndHideWalletButton, 200);
    const timeout3 = setTimeout(findAndHideWalletButton, 500);
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, []);

  const handleClick = () => {
    // Trouver et cliquer sur le bouton Wallet caché
    const walletButton = walletRef.current?.querySelector('button') as HTMLButtonElement;
    if (walletButton) {
      walletButton.click();
    } else {
      // Fallback : chercher dans tout le document
      const allWalletButtons = document.querySelectorAll('button[data-testid="ockWalletButton"], button[data-onchainkit="wallet-button"], [data-onchainkit="wallet-button"] button');
      if (allWalletButtons.length > 0) {
        (allWalletButtons[0] as HTMLButtonElement).click();
      }
    }
  };

  return (
    <>
      <div ref={walletRef} style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}>
        <Wallet />
      </div>
      <Button 
        size={size} 
        fullWidth={fullWidth} 
        onClick={handleClick} 
        className={className}
      >
        Connect Wallet
      </Button>
    </>
  );
}
