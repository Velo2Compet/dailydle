// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title Quizzdle
 * @dev Version sécurisée du jeu Quizzdle avec salage des réponses
 *
 * Sécurité:
 * - Les guesses sont salés avec signature session + SALT_DECRYPT
 * - Impossible pour un observateur de décoder les réponses
 * - Chaque user a des hash uniques par session
 * - L'USER soumet sa propre tx avec le hash + commitment signé par le serveur
 * - LE SERVEUR NE PAIE JAMAIS DE GAS
 */

interface IQuizzdleReferal {
    function referredBy(address user) external view returns (address);
}

contract Quizzdle {
    // ============ Structures ============

    struct SaltedGuess {
        bytes32 saltedGuessHash;    // hash(characterId, sessionSig, SALT_DECRYPT)
        uint256 timestamp;
        bool isCorrect;
    }

    struct UserSession {
        bytes32 commitment;          // hash(dailyCharId, sessionSig, SALT_DECRYPT)
        bool hasWonToday;            // A déjà gagné aujourd'hui
    }

    // ============ State Variables ============

    address public owner;
    address public server;  // Adresse qui signe les commitments

    uint256 public feePerGuess = 1000000000; // 0.000000001 ETH (1 Gwei)

    // Sessions par user: player => collectionId => day => session
    mapping(address => mapping(uint256 => mapping(uint256 => UserSession))) public userSessions;

    // Guesses salés: player => collectionId => day => SaltedGuess[]
    mapping(address => mapping(uint256 => mapping(uint256 => SaltedGuess[]))) public playerDailyGuesses;

    // Stats (identiques au contrat original)
    mapping(address => mapping(uint256 => uint256)) public winsPerCollection;
    mapping(address => uint256) public totalWins;
    mapping(address => uint256) public totalPaid;
    uint256 public globalTotalWins;
    uint256 public globalTotalPaid;

    // Stats par jour
    mapping(uint256 => mapping(uint256 => uint256)) public winsPerDayPerCollection; // collectionId => day => wins
    mapping(uint256 => uint256) public totalWinsPerDay; // day => total wins
    mapping(address => mapping(uint256 => uint256)) public playerTotalWinsPerDay; // player => day => wins

    // Rewards system
    mapping(uint256 => uint256) public dailyRevenue;
    mapping(uint256 => uint256) public dailyBonus; // Bonus goes 100% to winners
    mapping(uint256 => bool) public dayFinalized;
    mapping(uint256 => uint256) public rewardPerWinPerDay;
    mapping(address => mapping(uint256 => bool)) public claimedDays;
    uint256 public totalWinnerRewardsDistributed;
    uint256 public totalWinnerRewardsClaimed;

    // Referral system
    IQuizzdleReferal public referralContract;
    mapping(address => uint256) public referralRewards;
    mapping(address => uint256) public totalReferralEarned;
    uint256 public totalReferralRewards;
    uint256 public totalReferralsClaimed;

    // Collections
    mapping(uint256 => bool) public collectionExists;

    // Anti-abuse: Multi-wallet detection
    mapping(address => bool) public flaggedWallets;
    mapping(address => string) public flagReason;
    uint256 public totalFlaggedWallets;

    // ============ Events ============

    // Note: Pas de characterId dans les events ! C'est le but.
    event SaltedGuessMade(
        address indexed player,
        uint256 indexed collectionId,
        bytes32 saltedHash,     // Hash salé (indéchiffrable sans SALT_DECRYPT)
        bool isCorrect,
        uint256 attempts
    );

    event CommitmentSet(
        address indexed player,
        uint256 indexed collectionId,
        uint256 indexed day,
        bytes32 commitment
    );

    event WinRecorded(
        address indexed player,
        uint256 indexed collectionId,
        uint256 indexed day
    );

    event WalletFlagged(
        address indexed wallet,
        string reason
    );

    event WalletUnflagged(
        address indexed wallet
    );

    event DailyBonusAdded(
        uint256 indexed day,
        uint256 amount,
        address indexed addedBy
    );

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // ============ Constructor ============

    constructor() {
        owner = msg.sender;
        server = msg.sender; // Par défaut, owner est aussi server
    }

    // ============ User Functions ============

    /**
     * @dev Soumettre un guess salé avec commitment signé par le serveur
     * L'utilisateur envoie TOUT en une seule transaction:
     * - Le hash de son guess
     * - Le commitment (réponse correcte hashée)
     * - La signature du serveur qui prouve que le commitment est valide
     * - Flag multi-wallet (si détecté par le serveur, le user s'auto-flag!)
     *
     * @param _collectionId Collection ID
     * @param _saltedGuess hash(guessedCharId, sessionSignature, SALT_DECRYPT)
     * @param _commitment hash(dailyCharId, sessionSignature, SALT_DECRYPT)
     * @param _serverSignature Signature du serveur sur (player, collectionId, day, commitment, shouldFlag)
     * @param _shouldFlag true si multi-wallet détecté (signé par serveur)
     */
    function submitSaltedGuess(
        uint256 _collectionId,
        bytes32 _saltedGuess,
        bytes32 _commitment,
        bytes calldata _serverSignature,
        bool _shouldFlag
    ) external payable returns (bool isCorrect, uint256 attempts) {
        require(collectionExists[_collectionId], "Collection does not exist");
        require(msg.value >= feePerGuess, "Insufficient fee");

        uint256 currentDay = block.timestamp / 86400;
        UserSession storage session = userSessions[msg.sender][_collectionId][currentDay];

        // Vérifier que le joueur n'a pas déjà gagné
        require(!session.hasWonToday, "Already won today");

        // Si le commitment n'est pas encore défini, le définir après vérification de la signature
        if (session.commitment == bytes32(0)) {
            // Vérifier la signature du serveur (inclut maintenant shouldFlag)
            bytes32 messageHash = keccak256(abi.encodePacked(
                msg.sender,
                _collectionId,
                currentDay,
                _commitment,
                _shouldFlag
            ));
            bytes32 ethSignedHash = keccak256(abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                messageHash
            ));

            address signer = _recoverSigner(ethSignedHash, _serverSignature);
            require(signer == server, "Invalid server signature");

            // Définir le commitment
            session.commitment = _commitment;
            emit CommitmentSet(msg.sender, _collectionId, currentDay, _commitment);

            // Auto-flag si multi-wallet détecté (le user paie pour son propre flag!)
            if (_shouldFlag && !flaggedWallets[msg.sender]) {
                flaggedWallets[msg.sender] = true;
                flagReason[msg.sender] = "Multi-wallet detected";
                totalFlaggedWallets++;
                emit WalletFlagged(msg.sender, "Multi-wallet detected");
            }
        } else {
            // Le commitment existe déjà, vérifier qu'il correspond
            require(session.commitment == _commitment, "Commitment mismatch");
        }

        // Track payment
        totalPaid[msg.sender] += msg.value;
        globalTotalPaid += msg.value;
        dailyRevenue[currentDay] += msg.value;

        // Referral rewards (10%)
        if (address(referralContract) != address(0)) {
            address referrer = referralContract.referredBy(msg.sender);
            if (referrer != address(0)) {
                uint256 referralAmount = msg.value / 10;
                referralRewards[referrer] += referralAmount;
                totalReferralEarned[referrer] += referralAmount;
                totalReferralRewards += referralAmount;
            }
        }

        // Finalize previous day if needed
        if (currentDay > 0 && !dayFinalized[currentDay - 1] && dailyRevenue[currentDay - 1] > 0) {
            _finalizeDay(currentDay - 1);
        }

        // Comparer le guess avec le commitment
        isCorrect = (_saltedGuess == _commitment);

        // Enregistrer le guess
        playerDailyGuesses[msg.sender][_collectionId][currentDay].push(SaltedGuess({
            saltedGuessHash: _saltedGuess,
            timestamp: block.timestamp,
            isCorrect: isCorrect
        }));

        attempts = playerDailyGuesses[msg.sender][_collectionId][currentDay].length;

        // Si correct, enregistrer la victoire
        if (isCorrect) {
            session.hasWonToday = true;
            winsPerCollection[msg.sender][_collectionId]++;
            totalWins[msg.sender]++;
            globalTotalWins++;
            winsPerDayPerCollection[_collectionId][currentDay]++;
            totalWinsPerDay[currentDay]++;
            playerTotalWinsPerDay[msg.sender][currentDay]++;

            emit WinRecorded(msg.sender, _collectionId, currentDay);
        }

        // Event avec hash salé uniquement (pas de characterId!)
        emit SaltedGuessMade(msg.sender, _collectionId, _saltedGuess, isCorrect, attempts);

        return (isCorrect, attempts);
    }

    /**
     * @dev Recover signer from signature
     */
    function _recoverSigner(bytes32 _ethSignedHash, bytes calldata _signature) internal pure returns (address) {
        require(_signature.length == 65, "Invalid signature length");

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(_signature.offset)
            s := calldataload(add(_signature.offset, 32))
            v := byte(0, calldataload(add(_signature.offset, 64)))
        }

        if (v < 27) {
            v += 27;
        }

        require(v == 27 || v == 28, "Invalid signature v value");

        return ecrecover(_ethSignedHash, v, r, s);
    }

    // ============ View Functions ============

    function getCurrentDay() external view returns (uint256) {
        return block.timestamp / 86400;
    }

    function getUserSession(
        address _player,
        uint256 _collectionId,
        uint256 _day
    ) external view returns (
        bytes32 commitment,
        bool hasWonToday,
        uint256 attemptsToday
    ) {
        UserSession storage session = userSessions[_player][_collectionId][_day];
        uint256 attempts = playerDailyGuesses[_player][_collectionId][_day].length;
        return (
            session.commitment,
            session.hasWonToday,
            attempts
        );
    }

    function getPlayerDailyGuesses(
        address _player,
        uint256 _collectionId,
        uint256 _day
    ) external view returns (SaltedGuess[] memory) {
        return playerDailyGuesses[_player][_collectionId][_day];
    }

    function getAttemptsToday(
        address _player,
        uint256 _collectionId
    ) external view returns (uint256) {
        uint256 currentDay = block.timestamp / 86400;
        return playerDailyGuesses[_player][_collectionId][currentDay].length;
    }

    function hasWonToday(
        address _player,
        uint256 _collectionId
    ) external view returns (bool) {
        uint256 currentDay = block.timestamp / 86400;
        return userSessions[_player][_collectionId][currentDay].hasWonToday;
    }

    function getCommitment(
        address _player,
        uint256 _collectionId
    ) external view returns (bytes32) {
        uint256 currentDay = block.timestamp / 86400;
        return userSessions[_player][_collectionId][currentDay].commitment;
    }

    // ============ Rewards Functions ============

    function _finalizeDay(uint256 _day) internal {
        if (dayFinalized[_day]) return;

        uint256 totalRevenueForDay = dailyRevenue[_day];
        uint256 bonusForDay = dailyBonus[_day];
        uint256 winnersPool = 0;
        uint256 rewardPerWin = 0;

        if (totalWinsPerDay[_day] > 0) {
            // 45% of revenue + 100% of bonus goes to winners
            winnersPool = (totalRevenueForDay * 45) / 100 + bonusForDay;
            rewardPerWin = winnersPool / totalWinsPerDay[_day];
            totalWinnerRewardsDistributed += winnersPool;
        }

        rewardPerWinPerDay[_day] = rewardPerWin;
        dayFinalized[_day] = true;
    }

    function claimWinnerRewards(uint256 _day) external {
        require(!flaggedWallets[msg.sender], "Wallet flagged for abuse");
        require(dayFinalized[_day], "Day not finalized");
        require(!claimedDays[msg.sender][_day], "Already claimed");

        uint256 playerWins = playerTotalWinsPerDay[msg.sender][_day];
        require(playerWins > 0, "No wins for this day");

        uint256 rewardAmount = rewardPerWinPerDay[_day] * playerWins;
        require(rewardAmount > 0, "No rewards");

        claimedDays[msg.sender][_day] = true;
        totalWinnerRewardsClaimed += rewardAmount;

        (bool success, ) = payable(msg.sender).call{value: rewardAmount}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Claim all unclaimed winner rewards in one transaction
     * Iterates through past days and claims all pending rewards
     * @param _maxDaysToCheck Maximum number of days to check (to limit gas)
     */
    function claimAllWinnerRewards(uint256 _maxDaysToCheck) external {
        require(!flaggedWallets[msg.sender], "Wallet flagged for abuse");

        uint256 currentDay = block.timestamp / 86400;
        uint256 totalReward = 0;
        uint256 daysChecked = 0;

        // Start from yesterday and go back
        for (uint256 day = currentDay - 1; daysChecked < _maxDaysToCheck && day > 0; day--) {
            daysChecked++;

            // Skip if not finalized or already claimed
            if (!dayFinalized[day] || claimedDays[msg.sender][day]) {
                continue;
            }

            uint256 playerWins = playerTotalWinsPerDay[msg.sender][day];
            if (playerWins == 0) {
                continue;
            }

            uint256 rewardAmount = rewardPerWinPerDay[day] * playerWins;
            if (rewardAmount > 0) {
                claimedDays[msg.sender][day] = true;
                totalReward += rewardAmount;
            }
        }

        require(totalReward > 0, "No rewards to claim");

        totalWinnerRewardsClaimed += totalReward;

        (bool success, ) = payable(msg.sender).call{value: totalReward}("");
        require(success, "Transfer failed");
    }

    /**
     * @dev Get total pending rewards across all unclaimed days
     * @param _player Player address
     * @param _maxDaysToCheck Maximum days to check (to limit gas in view call)
     * @return totalPending Total unclaimed rewards
     * @return unclaimedDaysCount Number of days with unclaimed rewards
     */
    function getTotalPendingRewards(address _player, uint256 _maxDaysToCheck) external view returns (
        uint256 totalPending,
        uint256 unclaimedDaysCount
    ) {
        uint256 currentDay = block.timestamp / 86400;
        uint256 daysChecked = 0;

        for (uint256 day = currentDay - 1; daysChecked < _maxDaysToCheck && day > 0; day--) {
            daysChecked++;

            if (!dayFinalized[day] || claimedDays[_player][day]) {
                continue;
            }

            uint256 playerWins = playerTotalWinsPerDay[_player][day];
            if (playerWins == 0) {
                continue;
            }

            uint256 rewardAmount = rewardPerWinPerDay[day] * playerWins;
            if (rewardAmount > 0) {
                totalPending += rewardAmount;
                unclaimedDaysCount++;
            }
        }
    }

    function claimReferralRewards() external {
        require(!flaggedWallets[msg.sender], "Wallet flagged for abuse");
        uint256 amount = referralRewards[msg.sender];
        require(amount > 0, "No rewards");

        referralRewards[msg.sender] = 0;
        totalReferralsClaimed += amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }

    function getPendingWinnerRewards(address _player, uint256 _day) external view returns (uint256) {
        if (!dayFinalized[_day] || claimedDays[_player][_day]) {
            return 0;
        }
        uint256 playerWins = playerTotalWinsPerDay[_player][_day];
        if (playerWins == 0) {
            return 0;
        }
        return rewardPerWinPerDay[_day] * playerWins;
    }

    /**
     * @dev Get the total pool for a specific day (revenue + bonuses)
     * @param _day The day to check
     * @return totalPool Total ETH in pool
     * @return winnersPool 45% that will go to winners
     * @return isFinalized Whether the day is finalized
     * @return totalWins Number of wins that day
     */
    function getDayPool(uint256 _day) external view returns (
        uint256 totalPool,
        uint256 winnersPool,
        bool isFinalized,
        uint256 totalWins
    ) {
        uint256 revenue = dailyRevenue[_day];
        uint256 bonus = dailyBonus[_day];
        totalPool = revenue + bonus;
        // 45% of revenue + 100% of bonus goes to winners
        winnersPool = (revenue * 45) / 100 + bonus;
        isFinalized = dayFinalized[_day];
        totalWins = totalWinsPerDay[_day];
    }

    /**
     * @dev Get tomorrow's pool info
     */
    function getTomorrowPool() external view returns (
        uint256 totalPool,
        uint256 winnersPool,
        uint256 day
    ) {
        day = (block.timestamp / 86400) + 1;
        uint256 revenue = dailyRevenue[day];
        uint256 bonus = dailyBonus[day];
        totalPool = revenue + bonus;
        // 45% of revenue + 100% of bonus goes to winners
        winnersPool = (revenue * 45) / 100 + bonus;
    }

    // ============ Admin Functions ============

    function setServer(address _server) external onlyOwner {
        require(_server != address(0), "Invalid server address");
        server = _server;
    }

    function setFee(uint256 _fee) external onlyOwner {
        feePerGuess = _fee;
    }

    function setReferralContract(address _contract) external onlyOwner {
        referralContract = IQuizzdleReferal(_contract);
    }

    function addCollection(uint256 _collectionId) external onlyOwner {
        collectionExists[_collectionId] = true;
    }

    function removeCollection(uint256 _collectionId) external onlyOwner {
        collectionExists[_collectionId] = false;
    }

    /**
     * @dev Get total reserved funds (cannot be withdrawn)
     * Includes: unclaimed referrals + unclaimed winners + 45% of unfinalized revenue + 100% of unfinalized bonuses
     */
    function getTotalReserved() public view returns (
        uint256 totalReserved,
        uint256 reservedForReferrals,
        uint256 reservedForWinners,
        uint256 reservedForUnfinalized
    ) {
        reservedForReferrals = totalReferralRewards - totalReferralsClaimed;
        reservedForWinners = totalWinnerRewardsDistributed - totalWinnerRewardsClaimed;

        // Reserve 45% of unfinalized revenue + 100% of unfinalized bonuses
        uint256 currentDay = block.timestamp / 86400;

        // Today's potential winners pool (not finalized yet)
        if (!dayFinalized[currentDay]) {
            // 45% of revenue + 100% of bonus
            if (dailyRevenue[currentDay] > 0) {
                reservedForUnfinalized += (dailyRevenue[currentDay] * 45) / 100;
            }
            reservedForUnfinalized += dailyBonus[currentDay];
        }

        // Tomorrow's potential winners pool (if any revenue/bonus added)
        uint256 tomorrow = currentDay + 1;
        if (dailyRevenue[tomorrow] > 0) {
            reservedForUnfinalized += (dailyRevenue[tomorrow] * 45) / 100;
        }
        reservedForUnfinalized += dailyBonus[tomorrow];

        totalReserved = reservedForReferrals + reservedForWinners + reservedForUnfinalized;
    }

    function withdraw(address payable _to) external onlyOwner {
        require(_to != address(0), "Invalid address");

        (uint256 totalReserved, , , ) = getTotalReserved();

        uint256 withdrawable = address(this).balance > totalReserved ?
                               address(this).balance - totalReserved : 0;

        require(withdrawable > 0, "Nothing to withdraw");

        (bool success, ) = _to.call{value: withdrawable}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @dev Emergency withdraw - withdraws ALL funds regardless of reserves
     * Use with extreme caution! This will break pending rewards claims.
     * @param _to Address to send all funds to
     */
    function emergencyWithdraw(address payable _to) external onlyOwner {
        require(_to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");

        (bool success, ) = _to.call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /**
     * @dev Reset day stats after emergency withdraw (clears accumulated test data)
     * Only use this after emergency withdraw to fix accounting
     * @param _day The day to reset
     */
    function resetDayStats(uint256 _day) external onlyOwner {
        dailyRevenue[_day] = 0;
        dailyBonus[_day] = 0;
        totalWinsPerDay[_day] = 0;
        dayFinalized[_day] = false;
        rewardPerWinPerDay[_day] = 0;
    }

    /**
     * @dev Reset global reward counters after emergency withdraw
     * Only use this to fix accounting after emergency withdraw
     */
    function resetRewardCounters() external onlyOwner {
        totalWinnerRewardsDistributed = 0;
        totalWinnerRewardsClaimed = 0;
        totalReferralRewards = 0;
        totalReferralsClaimed = 0;
    }

    // ============ Incentive Functions ============

    /**
     * @dev Add bonus ETH to a specific day's reward pool
     * 100% of bonus goes to winners (unlike revenue which is 45%)
     * @param _day The day to add bonus to (use getCurrentDay() + 1 for tomorrow)
     */
    function addDailyBonus(uint256 _day) external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");
        require(!dayFinalized[_day], "Day already finalized");

        dailyBonus[_day] += msg.value;

        emit DailyBonusAdded(_day, msg.value, msg.sender);
    }

    /**
     * @dev Add bonus ETH for tomorrow's reward pool (convenience function)
     * 100% of bonus goes to winners
     */
    function addBonusForTomorrow() external payable onlyOwner {
        require(msg.value > 0, "Must send ETH");

        uint256 tomorrow = (block.timestamp / 86400) + 1;
        require(!dayFinalized[tomorrow], "Day already finalized");

        dailyBonus[tomorrow] += msg.value;

        emit DailyBonusAdded(tomorrow, msg.value, msg.sender);
    }

    // ============ Anti-Abuse Functions ============

    /**
     * @dev Flag a wallet for multi-wallet abuse (server or owner only)
     */
    function flagWallet(address _wallet, string calldata _reason) external {
        require(msg.sender == owner || msg.sender == server, "Not authorized");
        require(_wallet != address(0), "Invalid address");
        require(!flaggedWallets[_wallet], "Already flagged");

        flaggedWallets[_wallet] = true;
        flagReason[_wallet] = _reason;
        totalFlaggedWallets++;

        emit WalletFlagged(_wallet, _reason);
    }

    /**
     * @dev Unflag a wallet (owner only)
     */
    function unflagWallet(address _wallet) external onlyOwner {
        require(flaggedWallets[_wallet], "Not flagged");

        flaggedWallets[_wallet] = false;
        delete flagReason[_wallet];
        totalFlaggedWallets--;

        emit WalletUnflagged(_wallet);
    }

    /**
     * @dev Check if a wallet is flagged
     */
    function isWalletFlagged(address _wallet) external view returns (bool flagged, string memory reason) {
        return (flaggedWallets[_wallet], flagReason[_wallet]);
    }

    receive() external payable {}
    fallback() external payable {}
}
