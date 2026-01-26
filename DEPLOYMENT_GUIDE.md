# Guide de déploiement et test du contrat Dailydle

## Prérequis

1. Avoir un fichier `.env.local` avec :
   ```
   PRIVATE_KEY=votre_cle_privee_sans_0x
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   NEXT_PUBLIC_CONTRACT_ADDRESS= (sera rempli après le déploiement)
   QUIZZDLE_API_KEY=votre_cle_api_quizzdle
   QUIZZDLE_API_URL=https://quizzdle.fr
   ```
   
   **Note** : `NEXT_PUBLIC_CONTRACT_ADDRESS` est utilisée à la fois par le frontend Next.js et les scripts Hardhat. Vous pouvez aussi utiliser `CONTRACT_ADDRESS` pour les scripts si vous préférez, mais `NEXT_PUBLIC_CONTRACT_ADDRESS` fonctionne partout.

   **Quizzdle API** : `QUIZZDLE_API_KEY` et optionnellement `QUIZZDLE_API_URL` servent à appeler l’API Quizzdle (`/api/public/categories`, `/api/public/categories/{id}`) pour la page d’accueil, la liste des catégories et le jeu. Sans clé, les appels échoueront.

2. Avoir des fonds sur Base Sepolia (pour payer les frais de gas)

## Étapes de déploiement

### 1. Compiler le contrat

```bash
npm run compile
```

Cette commande compile le contrat Solidity et génère les artifacts nécessaires.

### 2. Déployer le contrat sur Base Sepolia

```bash
npm run deploy:base-sepolia
```

Ou directement avec Hardhat :

```bash
npx hardhat run smart-contracts/scripts/deploy.ts --network base-sepolia
```

**Important** : Notez l'adresse du contrat affichée à la fin. Elle ressemble à `0x...`

### 3. Mettre à jour le fichier .env.local

Ajoutez l'adresse du contrat dans votre `.env.local` :

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xVOTRE_ADRESSE_ICI
```

C'est tout ! Cette variable est utilisée à la fois par le frontend et les scripts Hardhat.

### 4. Initialiser le contrat avec vos données

Le script `initialize.ts` va lire votre fichier `data/test-collections.json` et initialiser toutes les collections :

```bash
npx hardhat run smart-contracts/scripts/initialize.ts --network base-sepolia
```

Ce script va :
- Extraire les IDs des personnages de chaque collection depuis le JSON
- Appeler `updateMultipleCollections()` pour créer toutes les collections en une seule transaction
- Vérifier que les collections ont bien été créées

### 5. Vérifier le déploiement

Vous pouvez vérifier que tout fonctionne en utilisant Hardhat console :

```bash
npx hardhat console --network base-sepolia
```

Puis dans la console :

```javascript
const Dailydle = await ethers.getContractFactory("Dailydle");
const dailydle = Dailydle.attach("VOTRE_ADRESSE_CONTRAT");

// Vérifier qu'une collection existe
await dailydle.collectionExists(1);

// Vérifier les IDs des personnages d'une collection
await dailydle.collectionCharacterIds(1);

// Tester le calcul du personnage du jour
await dailydle.getDailyCharacterId(1);
```

**Important** : Chaque personnage doit avoir un champ `id` unique qui sera stocké on-chain.

## Commandes utiles

### Compiler uniquement
```bash
npm run compile
```

### Déployer sur Base Sepolia
```bash
npm run deploy:base-sepolia
```

### Déployer sur Base Mainnet (production)
```bash
npm run deploy:base
```

### Initialiser les collections
```bash
npx hardhat run smart-contracts/scripts/initialize.ts --network base-sepolia
```

### Mettre à jour une collection manuellement

Si vous voulez mettre à jour une collection après l'initialisation, vous pouvez créer un script temporaire ou utiliser Hardhat console :

```bash
npx hardhat console --network base-sepolia
```

```javascript
const Dailydle = await ethers.getContractFactory("Dailydle");
const dailydle = Dailydle.attach("VOTRE_ADRESSE_CONTRAT");

// Mettre à jour la collection 1 avec de nouveaux IDs
const newCharacterIds = [1, 2, 3, 4, 5]; // Vos nouveaux IDs
await dailydle.updateCollectionCharacterIds(1, newCharacterIds);
```

## Dépannage

### Erreur "Collection does not exist"
- Vérifiez que vous avez bien exécuté le script `initialize.ts`
- Vérifiez que l'ID de collection dans votre JSON correspond à celui utilisé

### Erreur "Character IDs array cannot be empty"
- Vérifiez que chaque collection dans votre JSON a au moins un personnage avec un `id`

### Erreur de gas
- Vérifiez que vous avez suffisamment de fonds sur Base Sepolia
- Pour `updateMultipleCollections()`, si vous avez beaucoup de collections, vous pouvez les initialiser une par une avec `updateCollectionCharacterIds()`

## Test dans le frontend

Une fois le contrat déployé et initialisé :

1. Démarrez le serveur de développement :
   ```bash
   npm run dev
   ```

2. Allez sur `http://localhost:3000` (page d’accueil avec catégories Quizzdle).

3. Choisissez une collection puis `http://localhost:3000/game/[categoryId]`.

4. Connectez votre wallet et testez une proposition de personnage.

Le frontend utilise l’API Quizzdle pour les catégories et le jeu, et le contrat pour le personnage du jour et les guesses on-chain.
