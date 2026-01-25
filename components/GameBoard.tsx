"use client";
import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Collection } from "@/types/game";
import { CharacterSelector } from "./CharacterSelector";
import { StatsHeader } from "./StatsHeader";
import { GameFooter } from "./GameFooter";
import { WalletButton } from "./WalletButton";
import { Button } from "./Button";
import { useMakeGuess, useGameState, useCollectionStats } from "@/hooks/useGame";
import { useReadContract } from "wagmi";
import { formatAttributeValue } from "@/utils/game";
import { ArrowDown, ArrowUp } from "lucide-react";

interface GameBoardProps {
  collection: Collection;
}

export function GameBoard({ collection }: GameBoardProps) {
  const { isConnected } = useAccount();
  const { context, isFrameReady } = useMiniKit();
  const isFarcasterConnected = !!context?.user?.fid;
  const [selectedCharacterId, setSelectedCharacterId] = useState<number | null>(null);
  const [selectedCharacterName, setSelectedCharacterName] = useState<string | undefined>(undefined);
  const [selectedCharacterImage, setSelectedCharacterImage] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // État pour suivre quelles colonnes ont été révélées pour chaque guess (clé = index dans le tableau)
  const [revealedColumns, setRevealedColumns] = useState<Map<number, Set<number>>>(new Map());
  // État pour suivre quels guesses ont été complètement révélés (plus besoin d'animation)
  const [fullyRevealedGuesses, setFullyRevealedGuesses] = useState<Set<number>>(new Set());
  // État pour suivre le nombre de guesses précédents (pour détecter les nouveaux)
  const [previousGuessesCount, setPreviousGuessesCount] = useState<number>(0);
  
  const { makeGuess, isPending, isConfirming, isConfirmed, error } = useMakeGuess();
  const gameStateResult = useGameState(collection);
  const gameState = {
    collectionId: gameStateResult.collectionId,
    dailyCharacter: gameStateResult.dailyCharacter,
    dailyCharacterHash: gameStateResult.dailyCharacterHash,
    attempts: gameStateResult.attempts,
    maxAttempts: gameStateResult.maxAttempts,
    guesses: gameStateResult.guesses,
    isGameOver: gameStateResult.isGameOver,
    isGameWon: gameStateResult.isGameWon,
  };
  const refetchGameState = gameStateResult.refetch;
  const collectionStats = useCollectionStats(collection.id);

  // Vérifier que la collection existe dans le contrat
  const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}` || "0x0000000000000000000000000000000000000000";
  const { data: collectionExists } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: [
      {
        inputs: [{ name: "_collectionId", type: "uint256" }],
        name: "collectionExists",
        outputs: [{ name: "", type: "bool" }],
        stateMutability: "view",
        type: "function",
      },
    ],
    functionName: "collectionExists",
    args: [BigInt(collection.id)],
    query: {
      enabled: !!collection.id && CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000",
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
      setErrorMessage(`Collection ${collection.id} does not exist in the contract. Please initialize it first with the initialize.ts script`);
      return;
    }
    
    // Vérifier si ce personnage a déjà été deviné
    if (alreadyGuessed(selectedCharacterId)) {
      setErrorMessage("You have already guessed this character today.");
      return;
    }

    // Réinitialiser l'erreur
    setErrorMessage(null);

    try {
      // Lancer la transaction
      await makeGuess(collection.id, selectedCharacterId);
      
      // Réinitialiser la sélection immédiatement pour éviter les doubles clics
      setSelectedCharacterId(null);
      setSelectedCharacterName(undefined);
      setSelectedCharacterImage(undefined);
      
      // Ne pas afficher le résultat maintenant - attendre la confirmation
      // Le résultat sera mis à jour automatiquement via useGameState après confirmation
    } catch (err: unknown) {
      console.error("Error making guess:", err);
      const errorObj = err as { message?: string };
      let errorMsg = errorObj?.message || String(err) || "An error occurred during submission.";
      
      // Messages d'erreur plus clairs
      if (errorMsg.includes("Collection does not exist") || errorMsg.includes("Collection has no characters")) {
        errorMsg = `Collection ${collection.id} is not initialized in the contract. Please run the initialize.ts script first.`;
      } else if (errorMsg.includes("execution reverted") || errorMsg.includes("revert")) {
        errorMsg = "Transaction failed. Check that the collection is properly initialized in the contract.";
      }
      
      setErrorMessage(errorMsg);
    }
  };

  // Afficher les erreurs de transaction
  useEffect(() => {
    if (error) {
      const errorMsg = error.message || String(error) || "Transaction error";
      setErrorMessage(errorMsg);
    } else if (!isPending && !isConfirming) {
      // Réinitialiser l'erreur quand la transaction est terminée
      setErrorMessage(null);
    }
  }, [error, isPending, isConfirming]);

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

  // Rafraîchir l'état du jeu après confirmation de la transaction
  useEffect(() => {
    if (isConfirmed) {
      // Attendre un peu pour que la transaction soit propagée sur le réseau
      const timeout = setTimeout(() => {
        refetchGameState();
      }, 2000); // 2 secondes de délai pour la propagation
      
      return () => clearTimeout(timeout);
    }
  }, [isConfirmed, refetchGameState]);

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
          <div className="text-center flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 mb-4 sm:mb-12">
            <h1 className="text-3xl md:text-4xl font-black tracking-tight flex items-center">
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                {collection.name}
              </span>
            </h1>
          </div>

        {/* Message de victoire */}
        {gameState.isGameWon && (
          <div className="w-full relative bg-gradient-to-r from-[#121217] via-[#1a1a2e] to-[#121217] border border-violet-500/20 rounded-2xl shadow-xl shadow-violet-500/10 p-4 sm:p-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">🎉 Congratulations!</h2>
              <p className="text-muted-foreground">
                You found the character in {gameState.attempts} attempt(s)!
              </p>
            </div>
          </div>
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
              ) : (
                <p className="text-center text-white mb-4">Search and choose a character to get started...</p>
              )}
              <div className="flex flex-col sm:flex-row items-start justify-center gap-3 sm:gap-3">
                <div className="flex-1 w-full sm:max-w-none">
                  <CharacterSelector
                    characters={collection.characters || []}
                    selectedCharacterId={selectedCharacterId}
                    selectedCharacterName={selectedCharacterName}
                    selectedCharacterImage={selectedCharacterImage}
                    onSelect={handleCharacterSelect}
                    disabled={isPending || isConfirming || gameState.isGameOver || !isConnected}
                    disabledCharacters={gameState.guesses.map(g => g.characterId)}
                  />
                </div>
                
                {/* Conteneur pour le bouton aligné avec l'input (h-12) */}
                <div className="w-full sm:w-auto sm:h-12 sm:flex sm:items-center">
                  {!isConnected ? (
                    <WalletButton fullWidth={false} className="h-12 px-6 w-full sm:w-auto" />
                  ) : (
                    <Button
                      onClick={handleGuess}
                      disabled={
                        !selectedCharacterId || 
                        isPending || 
                        isConfirming || 
                        gameState.isGameOver ||
                        alreadyGuessed(selectedCharacterId)
                      }
                      className="h-12 px-6 whitespace-nowrap w-full sm:w-auto"
                    >
                      {isPending || isConfirming
                        ? "Envoi..."
                        : alreadyGuessed(selectedCharacterId || 0)
                        ? "Déjà deviné"
                        : "Deviner"}
                    </Button>
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-red/20 border border-red/30 rounded-lg text-red text-sm text-center">
                  ⚠️ {errorMessage}
                </div>
              )}

              {(isPending || isConfirming) && (
                <div className="mt-3 sm:mt-4 text-center text-muted-foreground">
                  <p>Transaction in progress...</p>
                  <p className="text-sm">Please wait while your guess is being confirmed.</p>
                </div>
              )}
            </div>
          )}

          {/* Tableau des résultats */}
          {gameState.guesses.length > 0 && (
            <div className="relative z-10 mt-4 sm:mt-6">
              <div className="flex sm:flex-col sm:!overflow-hidden flex-row overflow-hidden">
                {/* En-têtes */}
                <div className="flex gap-3 w-auto sm:flex-row min-w-28 sm:flex flex-col">
                  <div className="text-center font-semibold sm:border-b-4 border-b-0 pb-2 flex-1 min-w-24 sm:block flex items-center justify-center text-white">
                    Character
                  </div>
                  {collection.attributes.map((attr) => (
                    <div key={attr.name} className="text-center font-semibold sm:border-b-4 border-b-0 pb-2 flex-1 min-w-24 sm:block flex items-center justify-center text-white">
                      {attr.nameFront}
                    </div>
                  ))}
                </div>

                {/* Lignes de résultats */}
                <div className="flex sm:flex-col-reverse gap-2 sm:gap-4 sm:mt-2 mt-0 flex-row-reverse overflow-auto">
                  {gameState.guesses.map((guess, index) => {
                    const revealed = revealedColumns.get(index);
                    // Vérifier si cette proposition est complètement révélée (pas d'animation en cours)
                    const isFullyRevealed = fullyRevealedGuesses.has(index);
                    // Si la proposition est en cours d'animation (dans le Map mais pas complètement révélée)
                    // OU si elle n'est pas du tout dans le Map (nouveau guess qui n'a pas encore commencé l'animation)
                    const isCurrentlyAnimating = !isFullyRevealed;
                    // Pour les propositions en cours d'animation, on vérifie si chaque colonne est révélée
                    // Pour les autres (complètement révélées), on révèle tout par défaut
                    const isPersonnageRevealed = isCurrentlyAnimating ? (revealed?.has(0) ?? false) : true;
                    
                    return (
                      <div key={index} className="flex gap-3 w-auto sm:flex-row flex-col">
                        {/* Colonne personnage */}
                        <div className="min-w-24 min-h-16 flex-1">
                          <div className={`min-h-16 bg-white/10 border border-white/10 rounded flex items-center justify-center text-center min-w-24 flex-1 transition-opacity duration-300 ${isPersonnageRevealed ? 'opacity-100' : 'opacity-0'}`}>
                            <div className="w-full h-full relative flex items-center justify-center gap-2 p-2">
                              {guess.characterImage && (
                                <img
                                  src={guess.characterImage}
                                  alt={guess.characterName}
                                  className="w-10 h-10 rounded object-cover hidden sm:block"
                                />
                              )}
                              <div className="text-white text-sm font-medium truncate">
                                {guess.characterName}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Colonnes attributs */}
                        {guess.comparisons.map((comparison, compIndex) => {
                          const attrType = collection.attributes[compIndex]?.type;
                          const statusClass = getStatusClass(comparison);
                          const arrow = getArrow(comparison, attrType);
                          const columnIndex = compIndex + 1; // +1 car la colonne personnage est à l'index 0
                          // Pour les propositions en cours d'animation, vérifier si la colonne est révélée
                          // Si révélé est undefined (pas encore initialisé), la colonne n'est pas révélée
                          // Pour les autres (complètement révélées), révéler par défaut
                          const isRevealed = isCurrentlyAnimating ? (revealed?.has(columnIndex) ?? false) : true;
                          
                          return (
                            <div key={compIndex} className="flex-1 perspective min-w-24">
                              <div className={`relative w-full h-16 preserve-3d transform-style transition-transform duration-500 ${isRevealed ? 'rotate-y-180' : 'rotate-y-0'}`}>
                                {/* Face avant (cachée) */}
                                <div className="absolute inset-0 flex items-center justify-center bg-white/5 border border-white/10 text-white rounded backface-hidden"></div>
                                
                                {/* Face arrière (résultat) */}
                                <div className={`absolute inset-0 flex items-center justify-center text-white rounded backface-hidden rotate-y-180 px-2 ${statusClass}`}>
                                  <div className="relative w-full flex items-center justify-center text-center">
                                    <div className="flex items-end justify-center gap-1 w-full text-sm">
                                      {arrow}
                                      <span 
                                        className="line-clamp-2 overflow-hidden text-ellipsis"
                                        style={{
                                          display: '-webkit-box',
                                          WebkitBoxOrient: 'vertical',
                                          WebkitLineClamp: 2,
                                        }}
                                      >
                                        {formatAttributeValue(comparison.guessValue)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
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
    </div>
  );
}
