// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title QuizzdleReferal
 * @dev Smart contract for managing referral codes and tracking referrals
 */
contract QuizzdleReferal {
    // Owner of the contract
    address public owner;

    // Mapping from referral code to user address
    mapping(string => address) public codeToAddress;

    // Mapping from user address to their referral code
    mapping(address => string) public addressToCode;

    // Mapping from user address to who referred them
    mapping(address => address) public referredBy;

    // Mapping from user address to list of users they referred
    mapping(address => address[]) public referrals;

    // Mapping to check if a user has registered
    mapping(address => bool) public hasRegistered;

    // Total number of registered users
    uint256 public totalUsers;

    // Total number of referrals made
    uint256 public totalReferrals;

    // Events
    event CodeCreated(address indexed user, string code);
    event ReferralRegistered(address indexed newUser, address indexed referrer, string code);
    event UserRegistered(address indexed user);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Create or update a referral code for the caller
     * @param _code The referral code to set (must be unique and 3-20 chars)
     */
    function setReferralCode(string calldata _code) external {
        require(bytes(_code).length >= 3 && bytes(_code).length <= 20, "Code must be 3-20 characters");
        require(codeToAddress[_code] == address(0) || codeToAddress[_code] == msg.sender, "Code already taken");

        // If user already has a code, clear the old one
        string memory oldCode = addressToCode[msg.sender];
        if (bytes(oldCode).length > 0) {
            delete codeToAddress[oldCode];
        }

        // Set the new code
        codeToAddress[_code] = msg.sender;
        addressToCode[msg.sender] = _code;

        // Register user if not already
        if (!hasRegistered[msg.sender]) {
            hasRegistered[msg.sender] = true;
            totalUsers++;
            emit UserRegistered(msg.sender);
        }

        emit CodeCreated(msg.sender, _code);
    }

    /**
     * @dev Register a new user with a referral code
     * @param _referralCode The referral code used (can be empty)
     */
    function registerWithReferral(string calldata _referralCode) external {
        require(!hasRegistered[msg.sender], "Already registered");

        hasRegistered[msg.sender] = true;
        totalUsers++;

        // If referral code is provided and valid
        if (bytes(_referralCode).length > 0) {
            address referrer = codeToAddress[_referralCode];
            if (referrer != address(0) && referrer != msg.sender) {
                referredBy[msg.sender] = referrer;
                referrals[referrer].push(msg.sender);
                totalReferrals++;
                emit ReferralRegistered(msg.sender, referrer, _referralCode);
            }
        }

        emit UserRegistered(msg.sender);
    }

    /**
     * @dev Check if a referral code is available
     */
    function isCodeAvailable(string calldata _code) external view returns (bool) {
        return codeToAddress[_code] == address(0);
    }

    /**
     * @dev Get the number of referrals for a user
     */
    function getReferralCount(address _user) external view returns (uint256) {
        return referrals[_user].length;
    }

    /**
     * @dev Get all referrals for a user
     */
    function getUserReferrals(address _user) external view returns (address[] memory) {
        return referrals[_user];
    }

    /**
     * @dev Get user stats
     */
    function getUserStats(address _user) external view returns (
        string memory code,
        address referrer,
        uint256 referralCount,
        bool registered
    ) {
        code = addressToCode[_user];
        referrer = referredBy[_user];
        referralCount = referrals[_user].length;
        registered = hasRegistered[_user];
    }

    /**
     * @dev Get global stats (owner only for full list, public for counts)
     */
    function getGlobalStats() external view returns (
        uint256 totalUsers_,
        uint256 totalReferrals_
    ) {
        totalUsers_ = totalUsers;
        totalReferrals_ = totalReferrals;
    }
}
