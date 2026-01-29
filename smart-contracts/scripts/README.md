# Smart Contracts - Scripts de Déploiement

## 📋 Scripts Disponibles

### 🚀 Déploiement

#### `deploy-all.js` - Déploiement Complet
Script principal pour déployer tous les smart contracts en une seule commande.

**Ce qu'il fait:**
1. Déploie le contrat GM (GmStreak)
2. Déploie le contrat Referral
3. Déploie le contrat principal Quizzdle
4. Définit le salt (SALT_DECRYPT depuis .env.local)
5. Configure le referral contract sur Quizzdle

**Usage:**
```bash
npx hardhat run smart-contracts/scripts/deploy-all.js --network base-sepolia
```

**Prérequis:**
- Variable `SALT_DECRYPT` définie dans `.env.local`
- Suffisamment d'ETH sur Base Sepolia (~0.01 ETH)

**Après le déploiement:**
1. Copier les adresses des contrats dans `.env.local`
2. Lancer `register-collections.js` pour enregistrer les collections

---

### 📝 Configuration

#### `register-collections.js` - Gestion Intelligente des Collections
Script intelligent qui gère automatiquement l'enregistrement et la mise à jour des collections.

**Ce qu'il fait:**
1. Récupère toutes les collections depuis l'API Quizzdle
2. **Détecte automatiquement les changements** (personnages ajoutés/supprimés)
3. Enregistre les nouvelles collections
4. Met à jour les collections modifiées
5. Skip les collections inchangées
6. Peut être relancé à tout moment sans problème

**Usage:**
```bash
npx hardhat run smart-contracts/scripts/register-collections.js --network base-sepolia
```

**Prérequis:**
- Variable `NEXT_PUBLIC_CONTRACT_ADDRESS` définie dans `.env.local`
- Variable `QUIZZDLE_API_KEY` définie dans `.env.local`
- Contrat Quizzdle déjà déployé

---

### 🔍 Debug & Vérification

#### `check-contract-status.js` - Vérification de l'État du Contrat
Vérifie l'état complet du contrat déployé.

**Ce qu'il affiche:**
1. Owner du contrat
2. État du salt (privé, donc non lisible - c'est normal)
3. Referral contract configuré
4. Fee per guess (frais par tentative)
5. Liste des collections enregistrées (19 collections)
6. Balance du contrat

**Usage:**
```bash
npx hardhat run smart-contracts/scripts/check-contract-status.js --network base-sepolia
```

**Prérequis:**
- Variable `NEXT_PUBLIC_CONTRACT_ADDRESS` définie dans `.env.local`

---

#### `debug-daily-character.js` - Debug du Personnage du Jour
Debug complet du calcul du personnage du jour pour une collection.

**Ce qu'il affiche:**
1. IDs des personnages dans le contrat
2. Calcul du seed (hash)
3. Index calculé et personnage résultant
4. Personnages des jours précédents/suivants (pour vérifier que ça change)
5. Position de l'ID spécifique dans le tableau

**Usage:**
```bash
npx hardhat run smart-contracts/scripts/debug-daily-character.js --network base-sepolia
```

**Configuration:**
Modifier la ligne 13 pour changer la collection testée:
```javascript
const collectionId = 1; // 1 = League of Legends, 4 = Joueur de PSG, etc.
```

**Prérequis:**
- Variable `NEXT_PUBLIC_CONTRACT_ADDRESS` définie dans `.env.local`
- Variable `SALT_DECRYPT` définie dans `.env.local`

---

## 🔄 Workflow Complet de Déploiement

### 1️⃣ Premier Déploiement

```bash
# 1. Déployer tous les contrats
npx hardhat run smart-contracts/scripts/deploy-all.js --network base-sepolia

# 2. Mettre à jour .env.local avec les nouvelles adresses
# NEXT_PUBLIC_GM_CONTRACT_ADDRESS=0x...
# NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=0x...
# NEXT_PUBLIC_CONTRACT_ADDRESS=0x...

# 3. Enregistrer les collections (19 collections)
npx hardhat run smart-contracts/scripts/register-collections.js --network base-sepolia

# 4. Vérifier que tout est OK
npx hardhat run smart-contracts/scripts/check-contract-status.js --network base-sepolia
```

### 2️⃣ Vérification & Debug

```bash
# Vérifier l'état du contrat
npx hardhat run smart-contracts/scripts/check-contract-status.js --network base-sepolia

# Debug le personnage du jour
npx hardhat run smart-contracts/scripts/debug-daily-character.js --network base-sepolia
```

### 3️⃣ Si une Collection Manque ou a Changé

```bash
# Relancer le script - il détectera automatiquement:
# - Les nouvelles collections à enregistrer
# - Les collections modifiées à mettre à jour
# - Les collections inchangées à skip
npx hardhat run smart-contracts/scripts/register-collections.js --network base-sepolia
```

**Exemples de changements détectés:**
- Ajout d'un nouveau personnage à League of Legends (170 → 171)
- Suppression d'un personnage d'une collection
- Ajout d'une toute nouvelle collection dans l'API

---

## 📝 Variables d'Environnement Requises

Dans `.env.local`:

```bash
# Déploiement
PRIVATE_KEY=your_private_key_without_0x
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Sécurité
SALT_DECRYPT=0x... # Hash random pour sécuriser le tirage quotidien

# API
QUIZZDLE_API_KEY=your_quizzdle_api_key
NEXT_PUBLIC_QUIZZDLE_API_URL=https://quizzdle.com

# Adresses des contrats (après déploiement)
NEXT_PUBLIC_GM_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS=0x...
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...
```

---

## ⚠️ Notes Importantes

1. **Salt**: Le salt est utilisé pour rendre le tirage quotidien imprévisible. Utilisez une valeur random sécurisée (32 bytes). Une fois défini, ne le changez plus sinon tous les personnages du jour changeront.

2. **Gas**: Sur Base Sepolia, les transactions sont généralement rapides (2-5s). Le script attend 2 secondes entre chaque transaction pour éviter les conflits de nonces.

3. **Collections**: L'enregistrement des collections peut être interrompu et relancé. Les collections déjà enregistrées seront skippées automatiquement.

4. **Tests**: Avant de déployer en production, testez sur Base Sepolia d'abord.

---

## 🐛 Troubleshooting

### "replacement transaction underpriced"
- Attendez quelques secondes et relancez
- Ou augmentez le gas price dans le script

### "Collection has no characters"
- Vérifiez que l'API Quizzdle est accessible
- Vérifiez votre `QUIZZDLE_API_KEY`

### "Insufficient balance"
- Vous avez besoin d'au moins 0.01 ETH sur Base Sepolia
- Utilisez le faucet Base Sepolia

### Salt déjà défini
- Pas grave, le script continue
- Pour changer le salt, il faut redéployer le contrat
