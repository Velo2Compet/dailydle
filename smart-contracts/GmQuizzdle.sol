// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title GmQuizzdle
 * @dev Smart contract to track daily streaks for users
 * Users must call gm() each day to maintain their streak
 */
contract GmQuizzdle {
    // Owner of the contract
    address public owner;

    // Mappings for streak
    mapping(address => uint256) public currentStreak;    // Current streak of the player
    mapping(address => uint256) public longestStreak;    // Longest streak of the player
    mapping(address => uint256) public lastGmDay;        // Last day the player said GM
    mapping(address => uint256) public totalGms;         // Total number of GMs by the player

    // Global statistics
    uint256 public totalGmsGlobal;                       // Total of all GMs
    uint256 public uniquePlayers;                        // Number of unique players
    mapping(address => bool) public hasPlayedBefore;     // If the player has played before
    address[] public players;                            // List of all players

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
     * @dev Send a GM to maintain or start the streak
     * Can be called once per day per user
     */
    function gm() public {
        uint256 currentDay = block.timestamp / 86400;

        // Check that the user hasn't already said GM today
        require(lastGmDay[msg.sender] != currentDay, "Already said GM today");

        // Track new players
        if (!hasPlayedBefore[msg.sender]) {
            hasPlayedBefore[msg.sender] = true;
            players.push(msg.sender);
            uniquePlayers++;
        }

        // Check if the streak continues or is broken
        if (lastGmDay[msg.sender] == currentDay - 1) {
            // Consecutive day - increment the streak
            currentStreak[msg.sender]++;
        } else if (lastGmDay[msg.sender] == 0) {
            // First GM ever
            currentStreak[msg.sender] = 1;
        } else {
            // Streak broken - emit event and reset
            if (currentStreak[msg.sender] > 0) {
                emit StreakBroken(msg.sender, currentStreak[msg.sender]);
            }
            currentStreak[msg.sender] = 1;
        }

        // Update the last GM day
        lastGmDay[msg.sender] = currentDay;

        // Increment the counters
        totalGms[msg.sender]++;
        totalGmsGlobal++;

        // Update the longest streak if necessary
        if (currentStreak[msg.sender] > longestStreak[msg.sender]) {
            longestStreak[msg.sender] = currentStreak[msg.sender];
            emit NewLongestStreak(msg.sender, currentStreak[msg.sender]);
        }

        emit GmSent(msg.sender, currentStreak[msg.sender], currentDay);
    }

    /**
     * @dev Check if the user can say GM today
     */
    function canGmToday(address _player) public view returns (bool) {
        uint256 currentDay = block.timestamp / 86400;
        return lastGmDay[_player] != currentDay;
    }

    /**
     * @dev Check if the streak is still active (not broken)
     * A streak is active if the last GM was today or yesterday
     */
    function isStreakActive(address _player) public view returns (bool) {
        uint256 currentDay = block.timestamp / 86400;
        uint256 lastDay = lastGmDay[_player];

        // Streak active if GM today or yesterday
        return lastDay == currentDay || lastDay == currentDay - 1;
    }

    /**
     * @dev Returns the effective streak (0 if broken)
     */
    function getEffectiveStreak(address _player) public view returns (uint256) {
        if (isStreakActive(_player)) {
            return currentStreak[_player];
        }
        return 0;
    }

    /**
     * @dev Returns all stats of a player in a single call
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
     * @dev Returns the global stats
     */
    function getGlobalStats() public view returns (
        uint256 totalGms_,
        uint256 uniquePlayers_
    ) {
        totalGms_ = totalGmsGlobal;
        uniquePlayers_ = uniquePlayers;
    }

    /**
     * @dev Returns the list of all players with their longest streaks
     * Reserved for the contract owner
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
     * @dev Returns the total number of players
     */
    function getPlayersCount() public view returns (uint256) {
        return players.length;
    }
}
