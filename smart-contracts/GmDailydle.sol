// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GmDailydle
 * @dev Smart contract pour tracker les streaks quotidiennes des utilisateurs
 * Les utilisateurs doivent appeler gm() chaque jour pour maintenir leur streak
 */
contract GmDailydle {
    // Owner du contrat
    address public owner;

    // Mappings pour le streak
    mapping(address => uint256) public currentStreak;    // Streak actuelle du joueur
    mapping(address => uint256) public longestStreak;    // Plus longue streak du joueur
    mapping(address => uint256) public lastGmDay;        // Dernier jour où le joueur a fait GM
    mapping(address => uint256) public totalGms;         // Nombre total de GMs du joueur

    // Statistiques globales
    uint256 public totalGmsGlobal;                       // Total de tous les GMs
    uint256 public uniquePlayers;                        // Nombre de joueurs uniques
    mapping(address => bool) public hasPlayedBefore;     // Si le joueur a déjà joué
    address[] public players;                            // Liste de tous les joueurs

    // Events
    event GmSent(address indexed player, uint256 streak, uint256 day);
    event StreakBroken(address indexed player, uint256 previousStreak);
    event NewLongestStreak(address indexed player, uint256 streak);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Envoie un GM pour maintenir ou démarrer la streak
     * Peut être appelé une fois par jour par utilisateur
     */
    function gm() public {
        uint256 currentDay = block.timestamp / 86400;

        // Vérifier que l'utilisateur n'a pas déjà fait GM aujourd'hui
        require(lastGmDay[msg.sender] != currentDay, "Already said GM today");

        // Tracker les nouveaux joueurs
        if (!hasPlayedBefore[msg.sender]) {
            hasPlayedBefore[msg.sender] = true;
            players.push(msg.sender);
            uniquePlayers++;
        }

        // Vérifier si la streak continue ou est cassée
        if (lastGmDay[msg.sender] == currentDay - 1) {
            // Jour consécutif - incrémenter la streak
            currentStreak[msg.sender]++;
        } else if (lastGmDay[msg.sender] == 0) {
            // Premier GM ever
            currentStreak[msg.sender] = 1;
        } else {
            // Streak cassée - émettre l'event et reset
            if (currentStreak[msg.sender] > 0) {
                emit StreakBroken(msg.sender, currentStreak[msg.sender]);
            }
            currentStreak[msg.sender] = 1;
        }

        // Mettre à jour le dernier jour de GM
        lastGmDay[msg.sender] = currentDay;

        // Incrémenter les compteurs
        totalGms[msg.sender]++;
        totalGmsGlobal++;

        // Mettre à jour la plus longue streak si nécessaire
        if (currentStreak[msg.sender] > longestStreak[msg.sender]) {
            longestStreak[msg.sender] = currentStreak[msg.sender];
            emit NewLongestStreak(msg.sender, currentStreak[msg.sender]);
        }

        emit GmSent(msg.sender, currentStreak[msg.sender], currentDay);
    }

    /**
     * @dev Vérifie si l'utilisateur peut faire GM aujourd'hui
     */
    function canGmToday(address _player) public view returns (bool) {
        uint256 currentDay = block.timestamp / 86400;
        return lastGmDay[_player] != currentDay;
    }

    /**
     * @dev Vérifie si la streak est toujours active (pas cassée)
     * Une streak est active si le dernier GM était aujourd'hui ou hier
     */
    function isStreakActive(address _player) public view returns (bool) {
        uint256 currentDay = block.timestamp / 86400;
        uint256 lastDay = lastGmDay[_player];

        // Streak active si GM aujourd'hui ou hier
        return lastDay == currentDay || lastDay == currentDay - 1;
    }

    /**
     * @dev Retourne le streak effectif (0 si cassé)
     */
    function getEffectiveStreak(address _player) public view returns (uint256) {
        if (isStreakActive(_player)) {
            return currentStreak[_player];
        }
        return 0;
    }

    /**
     * @dev Retourne toutes les stats d'un joueur en un seul appel
     */
    function getPlayerStats(address _player) public view returns (
        uint256 streak,
        uint256 longest,
        uint256 total,
        bool canGm,
        bool streakActive
    ) {
        streak = getEffectiveStreak(_player);
        longest = longestStreak[_player];
        total = totalGms[_player];
        canGm = canGmToday(_player);
        streakActive = isStreakActive(_player);
    }

    /**
     * @dev Retourne les stats globales
     */
    function getGlobalStats() public view returns (
        uint256 totalGms_,
        uint256 uniquePlayers_
    ) {
        totalGms_ = totalGmsGlobal;
        uniquePlayers_ = uniquePlayers;
    }

    /**
     * @dev Retourne la liste de tous les joueurs avec leurs longest streaks
     * Réservé au owner du contrat
     */
    function getAllPlayersLongestStreaks() public view onlyOwner returns (
        address[] memory playerAddresses,
        uint256[] memory longestStreaks
    ) {
        uint256 count = players.length;
        playerAddresses = new address[](count);
        longestStreaks = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            playerAddresses[i] = players[i];
            longestStreaks[i] = longestStreak[players[i]];
        }
    }

    /**
     * @dev Retourne le nombre total de joueurs
     */
    function getPlayersCount() public view returns (uint256) {
        return players.length;
    }
}
