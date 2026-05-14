"use client";
import { useState, useEffect, useRef } from "react";
import { useAccount, useReadContract } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { parseAbi } from "viem";
import { APP_CHAIN_ID } from "@/lib/chain-config";
import { Collection } from "@/types/game";
import { CharacterSelector } from "./CharacterSelector";
import { StatsHeader } from "./StatsHeader";
import { GameFooter } from "./GameFooter";
import { Footer } from "./Footer";
import { WalletButton } from "./WalletButton";
import { Button } from "./Button";
import { VictoryAnimation } from "./VictoryAnimation";
import { useSecureGame } from "@/hooks/useSecureGame";
import { formatAttributeValue } from "@/utils/game";
import { ArrowDown, ArrowUp, Send, Loader2 } from "lucide-react";

// Contract configuration for stats
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

const statsAbi = parseAbi([
  "function winsPerCollection(address player, uint256 collectionId) external view returns (uint256)",
  "function winsPerDayPerCollection(uint256 collectionId, uint256 day) external view returns (uint256)",
  "function globalTotalWins() external view returns (uint256)",
  "function collectionExists(uint256 collectionId) external view returns (bool)",
]);

// Composant Tooltip personnalisé pour mobile et desktop
function MobileTooltip({
  content,
  children
}: {
  content: string;
  children: React.ReactNode;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, arrowLeft: '50%' });
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isHovered) return;

    const updatePosition = () => {
      if (containerRef.current && tooltipRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current.getBoundingClientRect();
        const padding = 8;
        const screenWidth = window.innerWidth;
        const elementCenter = rect.left + rect.width / 2;
        const tooltipWidth = tooltipRect.width || 100;

        let tooltipLeft = elementCenter - tooltipWidth / 2;

        if (tooltipLeft < padding) {
          tooltipLeft = padding;
        } else if (tooltipLeft + tooltipWidth > screenWidth - padding) {
          tooltipLeft = screenWidth - padding - tooltipWidth;
        }

        const arrowPos = elementCenter - tooltipLeft;
        const arrowPercent = Math.max(15, Math.min(85, (arrowPos / tooltipWidth) * 100));

        setPosition({
          top: rect.top - 8,
          left: tooltipLeft,
          arrowLeft: `${arrowPercent}%`
        });
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setPosition({
          top: rect.top - 8,
          left: rect.left + rect.width / 2 - 50,
          arrowLeft: '50%'
        });
      }
    };
    updatePosition();
    requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', updatePosition);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [content, isHovered]);

  return (
    <>
      <div
        ref={containerRef}
        className="w-full h-full cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => setTimeout(() => setIsHovered(false), 1500)}
      >
        {children}
      </div>
      {isHovered && (
        <div
          ref={tooltipRef}
          className="fixed z-[99999] pointer-events-none"
          style={{
            top: position.top,
            left: position.left,
            transform: 'translateY(-100%)'
          }}
        >
          <div className="relative pb-2">
            <div
              className="text-white text-sm px-3 py-2 rounded-lg min-w-[60px] max-w-[160px] text-center whitespace-normal break-words"
              style={{
                backgroundColor: '#1a1a2e',
                border: '2px solid #8b5cf6',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.9)'
              }}
            >
              {content}
            </div>
            <div
              className="absolute"
              style={{
                left: position.arrowLeft,
                transform: 'translateX(-50%)',
                bottom: '0',
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderTop: '10px solid #8b5cf6'
              }}
            />
            <div
              className="absolute"
              style={{
                left: position.arrowLeft,
                transform: 'translateX(-50%)',
                bottom: '2px',
                width: 0,
                height: 0,
                borderLeft: '8px solid transparent',
                borderRight: '8px solid transparent',
                borderTop: '8px solid #1a1a2e'
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

interface GameBoardProps {
  collection: Collection;
}

export function GameBoard({ collection }: GameBoardProps) {
  const { address, isConnected } = useAccount();
  const { context, isFrameReady } = useMiniKit();
  const isFarcasterConnected = !!context?.user?.fid;
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const [selectedCharacterName, setSelectedCharacterName] = useState<string | undefined>(undefined);
  const [selectedCharacterImage, setSelectedCharacterImage] = useState<string | undefined>(undefined);
  const [localErrorMessage, setLocalErrorMessage] = useState<string | null>(null);
  // État pour suivre quelles colonnes ont été révélées pour chaque guess (clé = index dans le tableau)
  const [revealedColumns, setRevealedColumns] = useState<Map<number, Set<number>>>(new Map());
  // État pour suivre quels guesses ont été complètement révélés (plus besoin d'animation)
  const [fullyRevealedGuesses, setFullyRevealedGuesses] = useState<Set<number>>(new Set());
  // État pour suivre le nombre de guesses précédents (pour détecter les nouveaux)
  const [previousGuessesCount, setPreviousGuessesCount] = useState<number>(0);

  // New secure game hook
  const {
    hasWonToday,
    attemptsToday,
    guesses,
    dailyCharacter,
    isLoading,
    error: gameError,
    isGuessPending,
    currentDay,
    hasSessionSignature,
    isSigningSession,
    submitGuess,
    signSession,
    clearError,
    refresh,
  } = useSecureGame(collection);

  // Compute game state from secure hook
  const gameState = {
    collectionId: collection.id,
    dailyCharacter,
    attempts: attemptsToday,
    guesses,
    isGameOver: hasWonToday,
    isGameWon: hasWonToday,
  };

  // Read collection stats from contract
  const { data: userWins } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: statsAbi,
    functionName: "winsPerCollection",
    args: address ? [address, BigInt(collection.id)] : undefined,
    chainId: APP_CHAIN_ID,
    query: { enabled: !!address && !!CONTRACT_ADDRESS },
  });

  const { data: winnersToday } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: statsAbi,
    functionName: "winsPerDayPerCollection",
    args: [BigInt(collection.id), BigInt(currentDay)],
    chainId: APP_CHAIN_ID,
    query: { enabled: !!CONTRACT_ADDRESS },
  });

  const { data: totalWinners } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: statsAbi,
    functionName: "globalTotalWins",
    chainId: APP_CHAIN_ID,
    query: { enabled: !!CONTRACT_ADDRESS },
  });

  const collectionStats = {
    userWins: userWins ? Number(userWins) : 0,
    winnersToday: winnersToday ? Number(winnersToday) : 0,
    totalWinners: totalWinners ? Number(totalWinners) : 0,
  };

  // Combined error message
  const errorMessage = localErrorMessage || gameError;

  // DEBUG: Log daily character for testing (only shown when won)
  useEffect(() => {
    if (gameState.dailyCharacter && hasWonToday) {
      console.log("🎯 DAILY CHARACTER (revealed after win):", {
        id: gameState.dailyCharacter.id,
        name: gameState.dailyCharacter.name,
        collectionId: collection.id,
        collectionName: collection.name,
      });
    }
  }, [gameState.dailyCharacter, hasWonToday, collection.id, collection.name]);

  // Vérifier que la collection existe dans le contrat
  const { data: collectionExists } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: statsAbi,
    functionName: "collectionExists",
    args: [BigInt(collection.id)],
    chainId: APP_CHAIN_ID,
    query: {
      enabled: !!collection.id && !!CONTRACT_ADDRESS,
    },
  });

  // Vérifier si un personnage a déjà été deviné
  const alreadyGuessed = (characterId: number) => {
    return gameState.guesses.some(g => g.characterId === characterId);
  };

  // Handler pour la sélection d'un personnage
  const handleCharacterSelect = (characterId: number, characterName: string, characterImage?: string) => {
    setSelectedCharacterId(characterId);
    setSelectedCharacterName(characterName);
    setSelectedCharacterImage(characterImage);
  };

  const handleGuess = async () => {
    if (!selectedCharacterId || !canPlay) return;

    // Vérifier que la collection existe dans le contrat
    if (collectionExists === false) {
      setLocalErrorMessage(`Collection ${collection.id} does not exist in the contract. Please initialize it first.`);
      return;
    }

    // Vérifier si ce personnage a déjà été deviné
    if (alreadyGuessed(selectedCharacterId)) {
      setLocalErrorMessage("You have already guessed this character today.");
      return;
    }

    // Réinitialiser l'erreur
    setLocalErrorMessage(null);
    clearError();

    try {
      // Submit guess using secure system
      const result = await submitGuess(selectedCharacterId);

      // Réinitialiser la sélection immédiatement pour éviter les doubles clics
      setSelectedCharacterId(null);
      setSelectedCharacterName(undefined);
      setSelectedCharacterImage(undefined);

      // Le résultat sera mis à jour via le hook après confirmation de la transaction
      if (!result) {
        // Error is already set in the hook
        return;
      }
    } catch (err: unknown) {
      console.error("Error making guess:", err);
      const errorObj = err as { message?: string };
      let errorMsg = errorObj?.message || String(err) || "An error occurred during submission.";

      // Messages d'erreur plus clairs
      if (errorMsg.includes("Collection does not exist") || errorMsg.includes("Collection has no characters")) {
        errorMsg = `Collection ${collection.id} is not initialized in the contract.`;
      } else if (errorMsg.includes("execution reverted") || errorMsg.includes("revert")) {
        errorMsg = "Transaction failed. Check that the collection is properly initialized in the contract.";
      } else if (errorMsg.includes("Session not initialized")) {
        errorMsg = "Session not initialized. Please try again.";
      }

      setLocalErrorMessage(errorMsg);
    }
  };

  // Afficher les erreurs de jeu
  useEffect(() => {
    if (gameError) {
      setLocalErrorMessage(gameError);
    } else if (!isLoading && !isGuessPending) {
      // Réinitialiser l'erreur locale quand le chargement est terminé
      setLocalErrorMessage(null);
    }
  }, [gameError, isLoading, isGuessPending]);

  // Initialiser les colonnes révélées pour les propositions existantes au chargement
  // On révèle immédiatement toutes les propositions sauf la dernière (qui sera animée si c'est un nouveau guess)
  useEffect(() => {
    if (gameState.guesses.length > 0) {
      // Vérifier que toutes les propositions ont des comparisons (données complètes)
      const allGuessesComplete = gameState.guesses.every(guess => 
        guess.comparisons && guess.comparisons.length > 0
      );
      
      if (allGuessesComplete) {
        const currentGuessesCount = gameState.guesses.length;
        
        setRevealedColumns(prev => {
          const newMap = new Map(prev);
          let hasChanges = false;
          
          gameState.guesses.forEach((guess, index) => {
            // Si cette proposition a déjà été complètement révélée, on la garde révélée
            if (fullyRevealedGuesses.has(index)) {
              // S'assurer qu'elle est bien dans le Map avec toutes les colonnes
              if (!newMap.has(index)) {
                const totalColumns = guess.comparisons.length + 1;
                const revealedSet = new Set<number>();
                for (let i = 0; i < totalColumns; i++) {
                  revealedSet.add(i);
                }
                newMap.set(index, revealedSet);
                hasChanges = true;
              }
            } 
            // Si ce n'est pas la dernière proposition (elle sera animée séparément)
            // ET qu'elle n'a pas encore été révélée, on la révèle immédiatement (sans animation)
            else if (index < currentGuessesCount - 1 && !newMap.has(index)) {
              const totalColumns = guess.comparisons.length + 1;
              const revealedSet = new Set<number>();
              for (let i = 0; i < totalColumns; i++) {
                revealedSet.add(i);
              }
              newMap.set(index, revealedSet);
              setFullyRevealedGuesses(prevSet => new Set([...prevSet, index]));
              hasChanges = true;
            }
          });
          
          return hasChanges ? newMap : prev;
        });
      }
    }
  }, [gameState.guesses, fullyRevealedGuesses]);

  // Rafraîchir l'état du jeu périodiquement si une transaction est en attente
  useEffect(() => {
    if (isGuessPending) {
      // Rafraîchir après que la transaction soit confirmée
      const timeout = setTimeout(() => {
        refresh();
      }, 3000);

      return () => clearTimeout(timeout);
    }
  }, [isGuessPending, refresh]);

  // Détecter quand un nouveau guess est ajouté et animer uniquement celui-là
  useEffect(() => {
    const currentGuessesCount = gameState.guesses.length;
    
    // Si le nombre de guesses a augmenté, c'est qu'un nouveau guess a été ajouté
    if (currentGuessesCount > previousGuessesCount && gameState.guesses.length > 0) {
      const lastIndex = currentGuessesCount - 1;
      const latestGuess = gameState.guesses[lastIndex];
      
      // Vérifier que ce guess a des comparisons (données complètes)
      if (latestGuess && latestGuess.comparisons && latestGuess.comparisons.length > 0) {
        
        // Initialiser l'animation pour la nouvelle proposition UNIQUEMENT (la dernière)
        const totalColumns = latestGuess.comparisons.length + 1; // +1 pour la colonne personnage
        
        // S'assurer que cette proposition commence complètement cachée (aucune colonne révélée)
        setRevealedColumns(prev => {
          const newMap = new Map(prev);
          // Réinitialiser complètement pour cette nouvelle proposition
          newMap.delete(lastIndex);
          return newMap;
        });
        
        // Ne pas marquer comme complètement révélée immédiatement
        setFullyRevealedGuesses(prevSet => {
          const newSet = new Set(prevSet);
          newSet.delete(lastIndex); // S'assurer qu'elle n'est pas marquée comme révélée
          return newSet;
        });
        
        // Démarrer l'animation après un court délai pour s'assurer que le DOM est prêt
        // Révéler les colonnes progressivement UNIQUEMENT pour cette nouvelle proposition
        for (let i = 0; i < totalColumns; i++) {
          setTimeout(() => {
            setRevealedColumns(prev => {
              const newMap = new Map(prev);
              const revealedSet = newMap.get(lastIndex) || new Set();
              revealedSet.add(i);
              newMap.set(lastIndex, revealedSet);
              return newMap;
            });
          }, 50 + i * 150); // 50ms de délai initial + 150ms entre chaque colonne
        }
        
        // Après que toutes les colonnes soient révélées, marquer cette proposition comme complètement révélée
        setTimeout(() => {
          setFullyRevealedGuesses(prevSet => new Set([...prevSet, lastIndex]));
          // S'assurer que toutes les colonnes sont bien dans le Map
          setRevealedColumns(prev => {
            const newMap = new Map(prev);
            if (!newMap.has(lastIndex) || newMap.get(lastIndex)?.size !== totalColumns) {
              const revealedSet = new Set<number>();
              for (let i = 0; i < totalColumns; i++) {
                revealedSet.add(i);
              }
              newMap.set(lastIndex, revealedSet);
            }
            return newMap;
          });
        }, 50 + totalColumns * 150 + 100); // Après l'animation + un petit délai
        
        // Mettre à jour le compteur de guesses précédents
        setPreviousGuessesCount(currentGuessesCount);
      }
    } else if (currentGuessesCount !== previousGuessesCount) {
      // Si le nombre de guesses a changé mais pas augmenté (rechargement de page par exemple)
      // Marquer tous les guesses existants comme complètement révélés
      setPreviousGuessesCount(currentGuessesCount);
    }
  }, [gameState.guesses.length, previousGuessesCount]);

  // En mode navigateur classique (pas dans Farcaster/Base App), permettre de continuer immédiatement
  const canProceed = isFrameReady || isFarcasterConnected || true;

  if (!canProceed) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full">
        <div className="w-full max-w-2xl mx-auto px-4">
          <div className="w-full relative bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl shadow-xl shadow-violet-500/10 p-12">
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 via-blue-500/5 to-violet-500/5 pointer-events-none rounded-2xl"></div>
            <div className="relative z-10 text-center">
              <h2 className="text-3xl md:text-4xl mb-4 font-black tracking-tight">
                <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                  Initializing...
                </span>
              </h2>
              <p className="text-muted-foreground text-lg">Loading application...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const canPlay = isConnected;

  interface Comparison {
    isCorrect: boolean;
    isPartial?: boolean;
    guessValue: number | string | string[];
    correctValue: number | string | string[];
  }

  const getStatusClass = (comparison: Comparison) => {
    if (comparison.isCorrect) return "bg-green";
    if (comparison.isPartial) return "bg-orange-400";
    return "bg-red";
  };

  const getArrow = (comparison: Comparison, attrType?: string) => {
    if (comparison.isCorrect) return null;

    // Pour les attributs de type int, afficher les flèches
    if (attrType === "int") {
      const guessNum = Number(comparison.guessValue);
      const correctNum = Number(comparison.correctValue);

      if (!isNaN(guessNum) && !isNaN(correctNum)) {
        if (guessNum > correctNum) return <ArrowDown className="w-4 h-4" />;
        if (guessNum < correctNum) return <ArrowUp className="w-4 h-4" />;
      }
    }
    return null;
  };

  return (
    <div className="flex flex-col min-h-screen">
      <StatsHeader />
      <div className="flex justify-center items-center px-2 sm:px-4 container mx-auto w-full max-w-[1200px] flex-1 py-4 sm:py-8">
        <div className="w-full space-y-3 sm:space-y-6">
          {/* Header */}
          <div className="text-center flex flex-col items-center justify-center gap-1 mb-4 sm:mb-6">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center">
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                {collection.name}
              </span>
            </h1>
            <span className="text-xs text-muted-foreground">
              a{" "}
              <a
                href={`${process.env.NEXT_PUBLIC_QUIZZDLE_API_URL || "https://quizzdle.fr"}/en/${collection.slug || ""}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-400 underline hover:no-underline transition-all"
              >
                quizzdle.fr
              </a>{" "}
              powered game
            </span>
          </div>

        {/* Message de victoire */}
        {gameState.isGameWon && (
          <VictoryAnimation
            characterName={gameState.guesses.find(g => g.isCorrect)?.characterName || "the character"}
            attempts={gameState.attempts}
          />
        )}

        {/* Zone de jeu */}
        {!gameState.isGameOver && (
            <div className="relative z-20 bg-black/20 rounded-lg border border-white/10 sm:p-6 px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4">
              {collectionExists === false && (
                <div className="mb-4 p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm text-center">
                  ⚠️ Collection {collection.id} does not exist in the contract. Please run the <code className="bg-black/30 px-2 py-1 rounded">initialize.ts</code> script to initialize it.
                </div>
              )}
              {!isConnected ? (
                <p className="text-center text-white mb-4">
                  Connect your wallet to start playing
                </p>
              ) : !hasSessionSignature ? (
                <p className="text-center text-white mb-4">
                  Sign the daily session to start playing — one signature for the whole day, all collections.
                </p>
              ) : (
                <p className="text-center text-white mb-4">Search and choose a character to get started...</p>
              )}

              {isConnected && !hasSessionSignature ? (
                <div className="flex justify-center">
                  <Button
                    onClick={() => signSession()}
                    disabled={isSigningSession}
                    className="h-12 px-6"
                    aria-label="Sign daily session"
                  >
                    {isSigningSession ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> Waiting for wallet…
                      </span>
                    ) : (
                      "Sign session to play"
                    )}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-row items-center gap-3">
                  <div className="flex-1">
                    <CharacterSelector
                      characters={collection.characters || []}
                      onSelect={handleCharacterSelect}
                      disabled={isLoading || isGuessPending || gameState.isGameOver || !isConnected}
                      disabledCharacters={gameState.guesses.map(g => g.characterId)}
                    />
                  </div>

                  {/* Submit button */}
                  <div className="h-12 flex items-center">
                    {!isConnected ? (
                      <WalletButton fullWidth={false} className="h-12 px-6" />
                    ) : (
                      <Button
                        onClick={handleGuess}
                        disabled={
                          !selectedCharacterId ||
                          isLoading ||
                          isGuessPending ||
                          gameState.isGameOver ||
                          alreadyGuessed(selectedCharacterId)
                        }
                        className="!h-12 !w-12 !p-0 !px-0 !py-0 flex items-center justify-center"
                        aria-label="Submit guess"
                      >
                        {isLoading || isGuessPending ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Send className="w-5 h-5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Selected character display - full width */}
              {selectedCharacterId && selectedCharacterName && (
                <div className="mt-3 flex items-center gap-4 p-4 bg-black/20 rounded-lg border border-white/10 w-full">
                  {selectedCharacterImage && (
                    <img
                      src={selectedCharacterImage}
                      alt={selectedCharacterName}
                      className="size-16 rounded object-cover border-2 border-violet-500/30"
                    />
                  )}
                  <span className="text-white font-semibold text-lg">{selectedCharacterName}</span>
                </div>
              )}

              {errorMessage && (
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-red/20 border border-red/30 rounded-lg text-red text-sm text-center">
                  ⚠️ {errorMessage}
                </div>
              )}

              {(isLoading || isGuessPending) && (
                <div className="mt-3 sm:mt-4 text-center text-muted-foreground">
                  <p>Transaction in progress...</p>
                  <p className="text-sm">Please wait while your guess is being confirmed.</p>
                </div>
              )}
            </div>
          )}

          {/* Tableau des résultats */}
          {gameState.guesses.length > 0 && (
            <div className="relative z-10 mt-4 overflow-hidden">
              {/* Container avec largeur minimale pour forcer le scroll horizontal si nécessaire */}
              <div className="min-w-full overflow-hidden">
                {/* En-têtes - toujours sur une ligne */}
                <div
                  className="grid gap-1 sm:gap-2 mb-2"
                  style={{ gridTemplateColumns: `repeat(${collection.attributes.length + 1}, minmax(0, 1fr))` }}
                >
                  <div className="text-center font-semibold text-[10px] sm:text-xs text-white truncate px-1">
                    Character
                  </div>
                  {collection.attributes.map((attr) => (
                    <div key={attr.name} className="text-center font-semibold text-[10px] sm:text-xs text-white truncate px-1">
                      {attr.nameFront}
                    </div>
                  ))}
                </div>

                {/* Lignes de résultats - du plus récent en haut */}
                <div className="flex flex-col-reverse gap-1 sm:gap-2">
                  {gameState.guesses.map((guess, index) => {
                    const revealed = revealedColumns.get(index);
                    const isFullyRevealed = fullyRevealedGuesses.has(index);
                    const isCurrentlyAnimating = !isFullyRevealed;
                    const isPersonnageRevealed = isCurrentlyAnimating ? (revealed?.has(0) ?? false) : true;

                    return (
                      <div
                        key={index}
                        className="grid gap-1 sm:gap-2"
                        style={{ gridTemplateColumns: `repeat(${collection.attributes.length + 1}, minmax(0, 1fr))` }}
                      >
                        {/* Colonne personnage */}
                        <div className={`h-12 sm:h-14 bg-white/10 border border-white/10 rounded transition-opacity duration-300 overflow-hidden ${isPersonnageRevealed ? 'opacity-100' : 'opacity-0'}`}>
                          <MobileTooltip content={guess.characterName}>
                            <div className="flex items-center justify-center gap-1 px-1 w-full h-full">
                              {guess.characterImage && (
                                <img
                                  src={guess.characterImage}
                                  alt={guess.characterName}
                                  className="w-6 h-6 sm:w-8 sm:h-8 rounded object-cover flex-shrink-0"
                                />
                              )}
                              <span className="text-white text-[9px] sm:text-xs font-medium truncate">
                                {guess.characterName}
                              </span>
                            </div>
                          </MobileTooltip>
                        </div>

                        {/* Colonnes attributs */}
                        {guess.comparisons.map((comparison, compIndex) => {
                          const attrType = collection.attributes[compIndex]?.type;
                          const statusClass = getStatusClass(comparison);
                          const arrow = getArrow(comparison, attrType);
                          const columnIndex = compIndex + 1;
                          const isRevealed = isCurrentlyAnimating ? (revealed?.has(columnIndex) ?? false) : true;

                          return (
                            <MobileTooltip key={compIndex} content={formatAttributeValue(comparison.guessValue)}>
                              <div className="perspective overflow-hidden h-12 sm:h-14">
                                <div className={`relative w-full h-full preserve-3d transform-style transition-transform duration-500 ${isRevealed ? 'rotate-y-180' : 'rotate-y-0'}`}>
                                  {/* Face avant (cachée) */}
                                  <div className="absolute inset-0 flex items-center justify-center bg-white/5 border border-white/10 text-white rounded backface-hidden"></div>

                                  {/* Face arrière (résultat) */}
                                  <div className={`absolute inset-0 text-white rounded backface-hidden rotate-y-180 ${statusClass}`}>
                                    <div className="flex items-center justify-center gap-0.5 w-full h-full px-1">
                                      {arrow}
                                      <span className="text-[9px] sm:text-xs text-center truncate leading-tight">
                                        {formatAttributeValue(comparison.guessValue)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </MobileTooltip>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <GameFooter
        attempts={gameState.attempts}
        userWins={collectionStats.userWins}
        winnersToday={collectionStats.winnersToday}
        totalWinners={collectionStats.totalWinners}
      />
      <Footer />
    </div>
  );
}
