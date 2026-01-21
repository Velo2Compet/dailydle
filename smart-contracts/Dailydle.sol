// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Dailydle
 * @dev Smart contract pour le jeu de devinette de personnages on-chain
 */
contract Dailydle {
    // Structures
    struct Guess {
        address player;
        uint256 collectionId;
        uint256 characterId;
        uint256 timestamp;
        bool isCorrect;
    }

    // Owner du contrat
    address public owner;
    
    // Frais par proposition (en wei) - par défaut 0.000001 ETH = 1000000000 wei
    uint256 public feePerGuess = 1000000000; // 0.000001 ETH en wei
    
    // State variables
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public attemptsPerDay; // player => collectionId => day => attempts
    mapping(address => mapping(uint256 => Guess[])) public playerGuesses; // player => collectionId => Guess[]
    mapping(address => mapping(uint256 => uint256)) public winsPerCollection; // player => collectionId => nombre de victoires
    mapping(address => uint256) public totalWins; // player => nombre total de victoires (toutes collections confondues)
    
    // Statistiques globales : total de toutes les victoires (tous utilisateurs, toutes collections)
    uint256 public globalTotalWins; // Total de toutes les victoires de tous les joueurs, toutes collections confondues
    
    // Statistiques globales par collection
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasWonToday; // collectionId => day => player => hasWon
    mapping(uint256 => mapping(uint256 => uint256)) public winnersTodayCount; // collectionId => day => count
    mapping(uint256 => mapping(address => bool)) public hasWonEver; // collectionId => player => hasWon
    mapping(uint256 => uint256) public totalWinnersCount; // collectionId => count
    
    // Stockage des collections : seulement les IDs des personnages
    mapping(uint256 => uint256[]) public collectionCharacterIds; // collectionId => array d'IDs de personnages
    mapping(uint256 => bool) public collectionExists; // collectionId => true/false pour vérifier l'existence

    // Events
    event CollectionUpdated(uint256 indexed collectionId, uint256 characterCount);
    event CollectionsUpdated(uint256[] indexed collectionIds);
    event GuessMade(
        address indexed player,
        uint256 indexed collectionId,
        uint256 indexed characterId,
        bool isCorrect,
        uint256 attempts
    );
    event FeeUpdated(uint256 newFee);
    event FundsWithdrawn(address indexed to, uint256 amount);

    // Modifiers
    modifier validCollection(uint256 _collectionId) {
        require(collectionExists[_collectionId], "Collection does not exist");
        require(collectionCharacterIds[_collectionId].length > 0, "Collection has no characters");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }
    
    /**
     * @dev Constructeur - définit le owner comme le déployeur
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Met à jour la liste d'IDs de personnages pour une collection
     * Si la collection n'existe pas, elle est créée automatiquement
     * @param _collectionId ID de la collection
     * @param _characterIds Tableau des IDs de personnages
     */
    function updateCollectionCharacterIds(
        uint256 _collectionId,
        uint256[] memory _characterIds
    ) public {
        require(_characterIds.length > 0, "Character IDs array cannot be empty");
        
        // Créer la collection si elle n'existe pas
        if (!collectionExists[_collectionId]) {
            collectionExists[_collectionId] = true;
        }
        
        // Remplacer complètement la liste d'IDs
        collectionCharacterIds[_collectionId] = _characterIds;
        
        emit CollectionUpdated(_collectionId, _characterIds.length);
    }

    /**
     * @dev Met à jour plusieurs collections en une seule transaction
     * @param _collectionIds Tableau des IDs de collections
     * @param _characterIdsArrays Tableau de tableaux, chaque sous-tableau correspond à une collection
     */
    function updateMultipleCollections(
        uint256[] memory _collectionIds,
        uint256[][] memory _characterIdsArrays
    ) public {
        require(_collectionIds.length == _characterIdsArrays.length, "Arrays length mismatch");
        
        for (uint256 i = 0; i < _collectionIds.length; i++) {
            require(_characterIdsArrays[i].length > 0, "Character IDs array cannot be empty");
            
            uint256 collectionId = _collectionIds[i];
            
            // Créer la collection si elle n'existe pas
            if (!collectionExists[collectionId]) {
                collectionExists[collectionId] = true;
            }
            
            // Remplacer complètement la liste d'IDs
            collectionCharacterIds[collectionId] = _characterIdsArrays[i];
        }
        
        emit CollectionsUpdated(_collectionIds);
    }

    /**
     * @dev Fait une proposition (transaction on-chain)
     * Utilise le calcul on-chain du personnage du jour
     * Requiert le paiement des frais
     * @return isCorrect true si la proposition est correcte
     * @return attempts nombre de tentatives pour ce jour
     */
    function makeGuess(uint256 _collectionId, uint256 _characterId) 
        public 
        payable
        validCollection(_collectionId) 
        returns (bool isCorrect, uint256 attempts) 
    {
        // Vérifier que les frais sont payés
        require(msg.value >= feePerGuess, "Insufficient fee paid");
        
        // Si plus que les frais requis, rembourser l'excédent
        if (msg.value > feePerGuess) {
            payable(msg.sender).transfer(msg.value - feePerGuess);
        }
        
        uint256 currentDay = block.timestamp / 86400;
        
        // Calculer le personnage du jour on-chain
        uint256 dailyCharacterId = getDailyCharacterId(_collectionId);
        
        // Vérifier si la proposition est correcte
        isCorrect = (_characterId == dailyCharacterId);
        
        // Si la proposition est correcte, incrémenter les compteurs de victoires
        if (isCorrect) {
            winsPerCollection[msg.sender][_collectionId]++;
            totalWins[msg.sender]++;
            globalTotalWins++; // Incrémenter le total global de toutes les victoires
            
            // Mettre à jour les statistiques globales
            // Si c'est la première victoire de ce joueur aujourd'hui pour cette collection
            if (!hasWonToday[_collectionId][currentDay][msg.sender]) {
                hasWonToday[_collectionId][currentDay][msg.sender] = true;
                winnersTodayCount[_collectionId][currentDay]++;
            }
            
            // Si c'est la première victoire de ce joueur de tous temps pour cette collection
            if (!hasWonEver[_collectionId][msg.sender]) {
                hasWonEver[_collectionId][msg.sender] = true;
                totalWinnersCount[_collectionId]++;
            }
        }
        
        // Incrémenter le compteur de tentatives pour ce jour
        attemptsPerDay[msg.sender][_collectionId][currentDay]++;
        attempts = attemptsPerDay[msg.sender][_collectionId][currentDay];
        
        // Enregistrer la proposition
        playerGuesses[msg.sender][_collectionId].push(Guess({
            player: msg.sender,
            collectionId: _collectionId,
            characterId: _characterId,
            timestamp: block.timestamp,
            isCorrect: isCorrect
        }));
        
        emit GuessMade(msg.sender, _collectionId, _characterId, isCorrect, attempts);
    }

    /**
     * @dev Calcule le personnage du jour de manière déterministe on-chain
     * @param _collectionId ID de la collection
     * @return characterId ID du personnage du jour (depuis le tableau d'IDs)
     */
    function getDailyCharacterId(uint256 _collectionId) 
        public 
        view 
        validCollection(_collectionId) 
        returns (uint256) 
    {
        uint256 currentDay = block.timestamp / 86400; // Nombre de jours depuis l'epoch
        uint256 year = (currentDay / 365) + 1970; // Approximation de l'année
        uint256 dayOfYear = currentDay % 365; // Approximation du jour de l'année
        
        // Seed déterministe : année * 1000 + jour de l'année + ID de la collection * 10000
        uint256 seed = year * 1000 + dayOfYear + _collectionId * 10000;
        uint256 totalCharacters = collectionCharacterIds[_collectionId].length;
        
        require(totalCharacters > 0, "Collection has no characters");
        
        // Sélectionner un index de manière déterministe
        uint256 characterIndex = seed % totalCharacters;
        
        // Retourner l'ID du personnage depuis le tableau
        return collectionCharacterIds[_collectionId][characterIndex];
    }

    /**
     * @dev Vérifie si une proposition est correcte (view function)
     * Utilise le calcul on-chain du personnage du jour
     */
    function verifyGuess(uint256 _collectionId, uint256 _characterId) 
        public 
        view 
        validCollection(_collectionId) 
        returns (bool) 
    {
        // Calculer le personnage du jour on-chain
        uint256 dailyCharacterId = getDailyCharacterId(_collectionId);
        
        // Vérifier si le personnage deviné correspond au personnage du jour
        return _characterId == dailyCharacterId;
    }

    /**
     * @dev Récupère le nombre de tentatives d'un joueur pour une collection et un jour donné
     */
    function getAttempts(address _player, uint256 _collectionId, uint256 _day) 
        public 
        view 
        returns (uint256) 
    {
        return attemptsPerDay[_player][_collectionId][_day];
    }

    /**
     * @dev Récupère toutes les propositions d'un joueur pour une collection
     */
    function getPlayerGuesses(address _player, uint256 _collectionId) 
        public 
        view 
        returns (Guess[] memory) 
    {
        return playerGuesses[_player][_collectionId];
    }


    /**
     * @dev Récupère le nombre de victoires d'un joueur pour une collection spécifique
     */
    function getWinsPerCollection(address _player, uint256 _collectionId) 
        public 
        view 
        returns (uint256) 
    {
        return winsPerCollection[_player][_collectionId];
    }

    /**
     * @dev Récupère le nombre total de victoires d'un joueur (toutes collections confondues)
     */
    function getTotalWins(address _player) 
        public 
        view 
        returns (uint256) 
    {
        return totalWins[_player];
    }

    /**
     * @dev Récupère le nombre total de victoires de tous les joueurs (toutes collections confondues)
     */
    function getGlobalTotalWins() 
        public 
        view 
        returns (uint256) 
    {
        return globalTotalWins;
    }

    /**
     * @dev Récupère le nombre de joueurs qui ont trouvé aujourd'hui pour une collection
     */
    function getWinnersTodayCount(uint256 _collectionId, uint256 _day) 
        public 
        view 
        returns (uint256) 
    {
        return winnersTodayCount[_collectionId][_day];
    }

    /**
     * @dev Récupère le nombre total de joueurs qui ont trouvé de tous temps pour une collection
     */
    function getTotalWinnersCount(uint256 _collectionId) 
        public 
        view 
        validCollection(_collectionId)
        returns (uint256) 
    {
        return totalWinnersCount[_collectionId];
    }

    /**
     * @dev Récupère la liste des IDs de personnages pour une collection
     */
    function getCollectionCharacterIds(uint256 _collectionId) 
        public 
        view 
        returns (uint256[] memory) 
    {
        return collectionCharacterIds[_collectionId];
    }
    
    /**
     * @dev Définit les frais pour chaque proposition (seulement owner)
     * @param _newFee Nouveau montant des frais en wei
     */
    function setFee(uint256 _newFee) 
        public 
        onlyOwner 
    {
        feePerGuess = _newFee;
        emit FeeUpdated(_newFee);
    }
    
    /**
     * @dev Retire les fonds accumulés dans le contrat (seulement owner)
     * @param _to Adresse vers laquelle envoyer les fonds
     */
    function withdraw(address payable _to) 
        public 
        onlyOwner 
    {
        require(_to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");
        
        (bool success, ) = _to.call{value: balance}("");
        require(success, "Withdrawal failed");
        
        emit FundsWithdrawn(_to, balance);
    }
    
    /**
     * @dev Permet au contrat de recevoir des ETH (pour les frais)
     */
    receive() external payable {
        // Permet au contrat de recevoir des ETH
    }
    
    /**
     * @dev Fallback function
     */
    fallback() external payable {
        // Permet au contrat de recevoir des ETH via des transactions sans données
    }
}
