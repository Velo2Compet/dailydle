# Système Sécurisé avec Salage

## Vue d'ensemble

Ce système empêche les observateurs on-chain de découvrir le personnage du jour en salant toutes les réponses avec une signature de session unique + un secret serveur.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           USER                                   │
│                                                                  │
│  1. Sign session message                                         │
│  2. Prepay guesses (on-chain tx)                                │
│  3. Submit guess to server (character ID)                       │
│  4. Receive comparison results                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          SERVER                                  │
│                                                                  │
│  1. Verify session signature                                     │
│  2. Compute commitment = hash(dailyChar, sessionSig, SALT)      │
│  3. Set commitment on-chain (initializeSession)                 │
│  4. On guess: compute saltedGuess = hash(guess, sessionSig, SALT)│
│  5. Submit saltedGuess to blockchain                            │
│  6. Return comparison results to user                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        BLOCKCHAIN                                │
│                                                                  │
│  Stores:                                                         │
│  - User commitments (salted, unique per user/session)           │
│  - Salted guesses (impossible to decode without SALT_DECRYPT)   │
│  - isCorrect (yes/no, but can't identify which character)       │
│  - Win counts, rewards, etc.                                    │
│                                                                  │
│  Events emit:                                                    │
│  - saltedHash (meaningless without SALT_DECRYPT)                │
│  - isCorrect (but no characterId!)                              │
└─────────────────────────────────────────────────────────────────┘
```

## Sécurité

### Ce qu'un observateur voit

```
Event: SaltedGuessMade(
  player: 0xAlice,
  collectionId: 1,
  saltedHash: 0x7a8b9c... (indéchiffrable),
  isCorrect: true,
  attempts: 3
)
```

### Ce qu'un observateur NE PEUT PAS faire

1. **Décoder le characterId** - Besoin de `SALT_DECRYPT` (secret serveur)
2. **Comparer les hash entre users** - Chaque user a une signature différente
3. **Rejouer un hash** - Signature de session unique par jour
4. **Brute-forcer via l'API** - L'user ne voit jamais les hash bruts

### Comparaison avec l'ancien système

| Aspect | Ancien système | Nouveau système |
|--------|----------------|-----------------|
| characterId dans event | ✅ Visible | ❌ Hash salé |
| isCorrect dans event | ✅ Visible | ✅ Visible (mais inutile sans characterId) |
| Corrélation entre users | ✅ Possible | ❌ Impossible |
| Brute-force API | ✅ Possible | ❌ Impossible |

## Fichiers

### Smart Contract

- `smart-contracts/QuizzdleSalted.sol` - Nouveau contrat sécurisé

### API

- `app/api/session/init/route.ts` - Initialisation de session
- `app/api/salted-guess/route.ts` - Soumission de guess

### Frontend

- `hooks/useSecureGame.ts` - Hook React pour le nouveau flow
- `lib/salted-guess.ts` - Utilitaires de salage

## Configuration requise

### Variables d'environnement

```env
# Adresse du nouveau contrat (après déploiement)
NEXT_PUBLIC_CONTRACT_ADDRESS_SALTED=0x...

# Secret pour le salage (GARDER ABSOLUMENT SECRET)
SALT_DECRYPT=0x...

# Clé privée du serveur pour soumettre les transactions
SERVER_PRIVATE_KEY=0x...

# RPC URL
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

## Flow d'utilisation

### 1. Initialisation de session

```typescript
const { initSession } = useSecureGame(collection);

// User signe un message, serveur set le commitment
await initSession();
```

### 2. Prépaiement des guesses

```typescript
const { prepayGuesses } = useSecureGame(collection);

// User paie pour N guesses on-chain
await prepayGuesses(5);
```

### 3. Soumission d'un guess

```typescript
const { submitGuess } = useSecureGame(collection);

// User choisit un personnage, serveur calcule le hash et soumet
const result = await submitGuess(characterId);

if (result.isCorrect) {
  console.log("Gagné!", result.dailyCharacter);
} else {
  console.log("Comparaisons:", result.comparisons);
}
```

## Déploiement

### 1. Déployer le contrat

```bash
cd smart-contracts
npx hardhat run scripts/deploy-salted.ts --network baseSepolia
```

### 2. Configurer le serveur

```bash
# Générer une nouvelle clé privée pour le serveur
# ⚠️ Cette clé doit avoir des ETH pour payer le gas des transactions

# Ajouter au .env
SERVER_PRIVATE_KEY=0x...
```

### 3. Définir le serveur dans le contrat

```solidity
// Appeler depuis le owner
contract.setServer(serverAddress);
```

## Migration depuis l'ancien système

1. Déployer `QuizzdleSalted.sol`
2. Ajouter les nouvelles variables d'environnement
3. Utiliser `useSecureGame` au lieu de `useGame`
4. Les deux systèmes peuvent coexister pendant la transition

## FAQ

**Q: Pourquoi le serveur doit-il soumettre les transactions ?**
A: Si l'user soumettait lui-même, il pourrait brute-forcer en comparant les hash.

**Q: Le serveur peut-il tricher ?**
A: Oui, c'est le seul point de confiance. Mais c'était déjà le cas avec `SALT_DECRYPT`.

**Q: Que se passe-t-il si le serveur est down ?**
A: Les users ne peuvent pas jouer. C'est le trade-off pour la sécurité.

**Q: Les guesses prépayés sont-ils remboursables ?**
A: Non, une fois prépayés ils sont verrouillés. À implémenter si nécessaire.
