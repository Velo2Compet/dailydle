// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IQuizzdleReferal {
    function referredBy(address user) external view returns (address);
}

/**
 * @title Quizzdle
 * @dev Smart contract pour le jeu de devinette de personnages on-chain
 */
contract Quizzdle {
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

    // Salt prive pour rendre le tirage imprevisible
    bytes32 private salt;

    // Frais par proposition (en wei) - par defaut 0.000001 ETH = 1000000000 wei
    uint256 public feePerGuess = 1000000000; // 0.000001 ETH en wei

    // State variables
    mapping(address => mapping(uint256 => mapping(uint256 => uint256))) public attemptsPerDay; // player => collectionId => day => attempts
    mapping(address => mapping(uint256 => Guess[])) public playerGuesses; // player => collectionId => Guess[]
    mapping(address => mapping(uint256 => uint256)) public winsPerCollection; // player => collectionId => nombre de victoires
    mapping(address => uint256) public totalWins; // player => nombre total de victoires (toutes collections confondues)
    mapping(address => uint256) public totalPaid; // player => total amount paid in wei

    // Statistiques globales : total de toutes les victoires (tous utilisateurs, toutes collections)
    uint256 public globalTotalWins; // Total de toutes les victoires de tous les joueurs, toutes collections confondues
    uint256 public globalTotalPaid; // Total paid by all users

    // Statistiques globales par collection
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasWonToday; // collectionId => day => player => hasWon
    mapping(uint256 => mapping(uint256 => uint256)) public winnersTodayCount; // collectionId => day => count
    mapping(uint256 => mapping(address => bool)) public hasWonEver; // collectionId => player => hasWon
    mapping(uint256 => uint256) public totalWinnersCount; // collectionId => count

    // Referral reward system
    IQuizzdleReferal public referralContract;
    mapping(address => uint256) public referralRewards; // referrer => claimable rewards in wei
    mapping(address => uint256) public totalReferralEarned; // referrer => lifetime total earned (never reset)
    uint256 public totalReferralRewards; // total rewards accumulated
    uint256 public totalReferralsClaimed; // total rewards claimed

    // Stockage des collections : seulement les IDs des personnages
    mapping(uint256 => uint256[]) public collectionCharacterIds; // collectionId => array d'IDs de personnages
    mapping(uint256 => bool) public collectionExists; // collectionId => true/false pour verifier l'existence

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
    event SaltUpdated();
    event ReferralRewardCredited(address indexed referrer, address indexed player, uint256 amount);
    event ReferralRewardsClaimed(address indexed referrer, uint256 amount);
    event ReferralContractUpdated(address indexed newContract);

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
     * @dev Constructeur - definit le owner comme le deployeur
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Met a jour la liste d'IDs de personnages pour une collection
     * Si la collection n'existe pas, elle est creee automatiquement
     * @param _collectionId ID de la collection
     * @param _characterIds Tableau des IDs de personnages
     */
    function updateCollectionCharacterIds(
        uint256 _collectionId,
        uint256[] memory _characterIds
    ) public onlyOwner {
        require(_characterIds.length > 0, "Character IDs array cannot be empty");

        // Creer la collection si elle n'existe pas
        if (!collectionExists[_collectionId]) {
            collectionExists[_collectionId] = true;
        }

        // Remplacer completement la liste d'IDs
        collectionCharacterIds[_collectionId] = _characterIds;

        emit CollectionUpdated(_collectionId, _characterIds.length);
    }

    /**
     * @dev Met a jour plusieurs collections en une seule transaction
     * @param _collectionIds Tableau des IDs de collections
     * @param _characterIdsArrays Tableau de tableaux, chaque sous-tableau correspond a une collection
     */
    function updateMultipleCollections(
        uint256[] memory _collectionIds,
        uint256[][] memory _characterIdsArrays
    ) public onlyOwner {
        require(_collectionIds.length == _characterIdsArrays.length, "Arrays length mismatch");

        for (uint256 i = 0; i < _collectionIds.length; i++) {
            require(_characterIdsArrays[i].length > 0, "Character IDs array cannot be empty");

            uint256 collectionId = _collectionIds[i];

            // Creer la collection si elle n'existe pas
            if (!collectionExists[collectionId]) {
                collectionExists[collectionId] = true;
            }

            // Remplacer completement la liste d'IDs
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
        // Verifier que les frais sont payes
        require(msg.value >= feePerGuess, "Insufficient fee paid");

        // Track the fee paid
        totalPaid[msg.sender] += msg.value;
        globalTotalPaid += msg.value;

        // Credit 10% referral reward to referrer if exists
        if (address(referralContract) != address(0)) {
            address referrer = referralContract.referredBy(msg.sender);
            if (referrer != address(0)) {
                uint256 referralAmount = msg.value / 10;
                referralRewards[referrer] += referralAmount;
                totalReferralEarned[referrer] += referralAmount;
                totalReferralRewards += referralAmount;
                emit ReferralRewardCredited(referrer, msg.sender, referralAmount);
            }
        }

        uint256 currentDay = block.timestamp / 86400;

        // Calculer le personnage du jour on-chain
        uint256 dailyCharacterId = _getDailyCharacterId(_collectionId);

        // Verifier si la proposition est correcte
        isCorrect = (_characterId == dailyCharacterId);

        // Si la proposition est correcte, incrementer les compteurs de victoires
        if (isCorrect) {
            winsPerCollection[msg.sender][_collectionId]++;
            totalWins[msg.sender]++;
            globalTotalWins++; // Incrementer le total global de toutes les victoires

            // Mettre a jour les statistiques globales
            // Si c'est la premiere victoire de ce joueur aujourd'hui pour cette collection
            if (!hasWonToday[_collectionId][currentDay][msg.sender]) {
                hasWonToday[_collectionId][currentDay][msg.sender] = true;
                winnersTodayCount[_collectionId][currentDay]++;
            }

            // Si c'est la premiere victoire de ce joueur de tous temps pour cette collection
            if (!hasWonEver[_collectionId][msg.sender]) {
                hasWonEver[_collectionId][msg.sender] = true;
                totalWinnersCount[_collectionId]++;
            }
        }

        // Incrementer le compteur de tentatives pour ce jour
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
     * @dev Calcule le personnage du jour (internal, sale avec keccak256)
     */
    function _getDailyCharacterId(uint256 _collectionId)
        internal
        view
        returns (uint256)
    {
        uint256 currentDay = block.timestamp / 86400;
        uint256 totalCharacters = collectionCharacterIds[_collectionId].length;

        require(totalCharacters > 0, "Collection has no characters");

        uint256 seed = uint256(keccak256(abi.encodePacked(salt, currentDay, _collectionId)));
        uint256 characterIndex = seed % totalCharacters;
        return collectionCharacterIds[_collectionId][characterIndex];
    }

    /**
     * @dev Calcule le personnage du jour (externe, seulement owner)
     * @param _collectionId ID de la collection
     * @return characterId ID du personnage du jour
     */
    function getDailyCharacterId(uint256 _collectionId)
        public
        view
        onlyOwner
        validCollection(_collectionId)
        returns (uint256)
    {
        return _getDailyCharacterId(_collectionId);
    }

    /**
     * @dev Verifie si une proposition est correcte (view function)
     * Utilise le calcul on-chain du personnage du jour
     */
    function verifyGuess(uint256 _collectionId, uint256 _characterId)
        public
        view
        onlyOwner
        validCollection(_collectionId)
        returns (bool)
    {
        // Calculer le personnage du jour on-chain
        uint256 dailyCharacterId = _getDailyCharacterId(_collectionId);

        // Verifier si le personnage devine correspond au personnage du jour
        return _characterId == dailyCharacterId;
    }

    /**
     * @dev Recupere le nombre de tentatives d'un joueur pour une collection et un jour donne
     */
    function getAttempts(address _player, uint256 _collectionId, uint256 _day)
        public
        view
        returns (uint256)
    {
        return attemptsPerDay[_player][_collectionId][_day];
    }

    /**
     * @dev Recupere toutes les propositions d'un joueur pour une collection
     */
    function getPlayerGuesses(address _player, uint256 _collectionId)
        public
        view
        returns (Guess[] memory)
    {
        return playerGuesses[_player][_collectionId];
    }


    /**
     * @dev Recupere le nombre de victoires d'un joueur pour une collection specifique
     */
    function getWinsPerCollection(address _player, uint256 _collectionId)
        public
        view
        returns (uint256)
    {
        return winsPerCollection[_player][_collectionId];
    }

    /**
     * @dev Recupere le nombre total de victoires d'un joueur (toutes collections confondues)
     */
    function getTotalWins(address _player)
        public
        view
        returns (uint256)
    {
        return totalWins[_player];
    }

    /**
     * @dev Recupere le montant total paye par un joueur
     */
    function getTotalPaid(address _player)
        public
        view
        returns (uint256)
    {
        return totalPaid[_player];
    }

    /**
     * @dev Recupere le nombre total de victoires de tous les joueurs (toutes collections confondues)
     */
    function getGlobalTotalWins()
        public
        view
        returns (uint256)
    {
        return globalTotalWins;
    }

    /**
     * @dev Recupere le montant total paye par tous les joueurs
     */
    function getGlobalTotalPaid()
        public
        view
        returns (uint256)
    {
        return globalTotalPaid;
    }

    /**
     * @dev Recupere le nombre de joueurs qui ont trouve aujourd'hui pour une collection
     */
    function getWinnersTodayCount(uint256 _collectionId, uint256 _day)
        public
        view
        returns (uint256)
    {
        return winnersTodayCount[_collectionId][_day];
    }

    /**
     * @dev Recupere le nombre total de joueurs qui ont trouve de tous temps pour une collection
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
     * @dev Recupere la liste des IDs de personnages pour une collection
     */
    function getCollectionCharacterIds(uint256 _collectionId)
        public
        view
        returns (uint256[] memory)
    {
        return collectionCharacterIds[_collectionId];
    }

    /**
     * @dev Definit le contrat de referral (seulement owner)
     */
    function setReferralContract(address _referralContract)
        public
        onlyOwner
    {
        require(_referralContract != address(0), "Invalid referral contract address");
        referralContract = IQuizzdleReferal(_referralContract);
        emit ReferralContractUpdated(_referralContract);
    }

    /**
     * @dev Permet a un referrer de reclamer ses recompenses accumulees
     */
    function claimReferralRewards() external {
        uint256 amount = referralRewards[msg.sender];
        require(amount > 0, "No referral rewards to claim");

        referralRewards[msg.sender] = 0;
        totalReferralsClaimed += amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Referral reward transfer failed");

        emit ReferralRewardsClaimed(msg.sender, amount);
    }

    /**
     * @dev Recupere les recompenses de referral en attente pour un utilisateur
     */
    function pendingReferralRewards(address _user)
        external
        view
        returns (uint256)
    {
        return referralRewards[_user];
    }

    /**
     * @dev Recupere le total des recompenses de referral gagnees par un utilisateur (jamais remis a zero)
     */
    function getTotalReferralEarned(address _user)
        external
        view
        returns (uint256)
    {
        return totalReferralEarned[_user];
    }

    /**
     * @dev Definit le salt pour le calcul du personnage du jour (seulement owner)
     * @param _newSalt Nouveau salt (bytes32)
     */
    function setSalt(bytes32 _newSalt)
        public
        onlyOwner
    {
        salt = _newSalt;
        emit SaltUpdated();
    }

    /**
     * @dev Definit les frais pour chaque proposition (seulement owner)
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
     * @dev Retire les fonds accumules dans le contrat (seulement owner)
     * @param _to Adresse vers laquelle envoyer les fonds
     */
    function withdraw(address payable _to)
        public
        onlyOwner
    {
        require(_to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        uint256 reservedForReferrals = totalReferralRewards - totalReferralsClaimed;
        uint256 withdrawable = balance > reservedForReferrals ? balance - reservedForReferrals : 0;
        require(withdrawable > 0, "No funds to withdraw");

        (bool success, ) = _to.call{value: withdrawable}("");
        require(success, "Withdrawal failed");

        emit FundsWithdrawn(_to, withdrawable);
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
        // Permet au contrat de recevoir des ETH via des transactions sans donnees
    }
}
