# Smart Contracts Dailydle

Ce dossier contient les smart contracts Solidity pour le jeu Dailydle.

## Structure

- `Dailydle.sol` : Contrat principal du jeu
- `scripts/deploy.js` : Script de déploiement
- `scripts/initialize.js` : Script d'initialisation avec les données de test

## Déploiement

### 1. Configuration

Créez un fichier `.env` à la racine du projet avec :

```env
PRIVATE_KEY=votre_clé_privée
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org
```

### 2. Compiler le contrat

```bash
npm run compile
```

### 3. Déployer sur Base Sepolia (testnet)

```bash
npm run deploy:base-sepolia
```

Cela affichera l'adresse du contrat déployé. Ajoutez-la à votre `.env.local` :

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

### 4. Initialiser avec les données de test

```bash
CONTRACT_ADDRESS=0x... npx hardhat run smart-contracts/scripts/initialize.js --network base-sepolia
```

### 5. Déployer sur Base Mainnet

```bash
npm run deploy:base
```

## Fonctions du contrat

- `createCollection(string name)` : Crée une nouvelle collection
- `addCharacter(uint256 collectionId, string name, bytes32 attributesHash)` : Ajoute un personnage
- `updateDailyCharacter(uint256 collectionId, bytes32 characterHash)` : Met à jour le personnage du jour
- `makeGuess(uint256 collectionId, uint256 characterId)` : Fait une proposition (transaction)
- `verifyGuess(uint256 collectionId, uint256 characterId)` : Vérifie si une proposition est correcte (view)

## Notes

- Le personnage du jour est déterminé off-chain et son hash est stocké on-chain
- Chaque proposition est une transaction on-chain qui incrémente le compteur de tentatives
- Les tentatives sont suivies par jour (timestamp / 86400)
