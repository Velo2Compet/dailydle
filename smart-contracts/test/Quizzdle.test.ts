const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Quizzdle", function () {
  let quizzdle: any;
  let referral: any;
  let owner: any;
  let server: any;
  let player1: any;
  let player2: any;
  let player3: any;

  const COLLECTION_ID = 1;
  const FEE = 1000000000n; // 1 gwei

  // Helper to get current day
  async function getCurrentDay(): Promise<bigint> {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(Math.floor(block.timestamp / 86400));
  }

  // Helper to create salted hash (simulates what API does)
  function createSaltedHash(characterId: number, sessionSignature: string, salt: string): string {
    return ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "string", "string"],
        [characterId, sessionSignature, salt]
      )
    );
  }

  // Helper to sign commitment (simulates server signature)
  async function signCommitment(
    signer: any,
    playerAddress: string,
    collectionId: number,
    day: bigint,
    commitment: string,
    shouldFlag: boolean
  ): Promise<string> {
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "uint256", "uint256", "bytes32", "bool"],
        [playerAddress, collectionId, day, commitment, shouldFlag]
      )
    );
    return await signer.signMessage(ethers.getBytes(messageHash));
  }

  beforeEach(async function () {
    [owner, server, player1, player2, player3] = await ethers.getSigners();

    // Deploy Quizzdle
    const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
    quizzdle = await QuizzdleFactory.deploy();
    await quizzdle.waitForDeployment();

    // Deploy QuizzdleReferal
    const QuizzdleReferalFactory = await ethers.getContractFactory("QuizzdleReferal");
    referral = await QuizzdleReferalFactory.deploy();
    await referral.waitForDeployment();

    // Configure contract
    await quizzdle.setServer(server.address);
    await quizzdle.addCollection(COLLECTION_ID);
    await quizzdle.setReferralContract(await referral.getAddress());
  });

  describe("Deployment", function () {
    it("Should set owner correctly", async function () {
      expect(await quizzdle.owner()).to.equal(owner.address);
    });

    it("Should allow setting server address", async function () {
      expect(await quizzdle.server()).to.equal(server.address);
    });

    it("Should have correct default fee", async function () {
      expect(await quizzdle.feePerGuess()).to.equal(FEE);
    });
  });

  describe("Collection Management", function () {
    it("Should add collection", async function () {
      await quizzdle.addCollection(2);
      expect(await quizzdle.collectionExists(2)).to.be.true;
    });

    it("Should remove collection", async function () {
      await quizzdle.removeCollection(COLLECTION_ID);
      expect(await quizzdle.collectionExists(COLLECTION_ID)).to.be.false;
    });

    it("Should reject non-owner collection changes", async function () {
      await expect(
        quizzdle.connect(player1).addCollection(3)
      ).to.be.revertedWith("Only owner");
    });
  });

  describe("submitSaltedGuess", function () {
    const SALT = "test_salt_decrypt";
    const SESSION_SIG = "session_signature_123";
    const CORRECT_CHAR_ID = 42;
    const WRONG_CHAR_ID = 99;

    it("Should accept valid guess with correct signature", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const saltedGuess = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      const tx = await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        saltedGuess,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      await expect(tx).to.emit(quizzdle, "SaltedGuessMade");
      await expect(tx).to.emit(quizzdle, "CommitmentSet");
      await expect(tx).to.emit(quizzdle, "WinRecorded");

      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.true;
    });

    it("Should record incorrect guess without win", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const saltedGuess = createSaltedHash(WRONG_CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        saltedGuess,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.false;
      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(1);
    });

    it("Should reject invalid server signature", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const saltedGuess = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);

      // Sign with wrong signer (player1 instead of server)
      const badSignature = await signCommitment(
        player1,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          commitment,
          badSignature,
          false,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject insufficient fee", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          commitment,
          commitment,
          signature,
          false,
          { value: 0 }
        )
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should reject non-existent collection", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        999, // Non-existent collection
        currentDay,
        commitment,
        false
      );

      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          999,
          commitment,
          commitment,
          signature,
          false,
          { value: FEE }
        )
      ).to.be.revertedWith("Collection does not exist");
    });

    it("Should reject playing after already winning", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      // First guess - win
      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      // Second guess - should fail
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          commitment,
          commitment,
          signature,
          false,
          { value: FEE }
        )
      ).to.be.revertedWith("Already won today");
    });

    it("Should allow multiple wrong guesses before winning", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      // Wrong guesses
      for (let i = 0; i < 3; i++) {
        const wrongGuess = createSaltedHash(WRONG_CHAR_ID + i, SESSION_SIG, SALT);
        await quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          wrongGuess,
          commitment,
          signature,
          false,
          { value: FEE }
        );
      }

      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(3);
      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.false;

      // Final correct guess
      const correctGuess = createSaltedHash(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        correctGuess,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(4);
      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.true;
    });
  });

  describe("Auto-Flag Mechanism (shouldFlag)", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should auto-flag wallet when shouldFlag is true", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);

      // Signature with shouldFlag = true
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        true // shouldFlag
      );

      const tx = await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        true, // shouldFlag
        { value: FEE }
      );

      await expect(tx).to.emit(quizzdle, "WalletFlagged")
        .withArgs(player1.address, "Multi-wallet detected");

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.true;
      expect(await quizzdle.flagReason(player1.address)).to.equal("Multi-wallet detected");
    });

    it("Should not flag wallet when shouldFlag is false", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);

      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.false;
    });

    it("Should reject mismatched shouldFlag signature", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);

      // Sign with shouldFlag = false
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      // But submit with shouldFlag = true
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          commitment,
          commitment,
          signature,
          true, // Mismatch!
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should not double-flag already flagged wallet", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);

      // First guess with flag
      const signature1 = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        true
      );

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        createSaltedHash(99, SESSION_SIG, SALT), // Wrong guess
        commitment,
        signature1,
        true,
        { value: FEE }
      );

      const flaggedCountBefore = await quizzdle.totalFlaggedWallets();

      // Second guess - already flagged, shouldn't increment count
      // Note: Commitment already set, so shouldFlag check is skipped
      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment, // Correct guess this time
        commitment,
        signature1,
        true,
        { value: FEE }
      );

      const flaggedCountAfter = await quizzdle.totalFlaggedWallets();
      expect(flaggedCountAfter).to.equal(flaggedCountBefore);
    });
  });

  describe("Admin Flag Functions", function () {
    it("Should allow owner to flag wallet", async function () {
      await quizzdle.connect(owner).flagWallet(player1.address, "Manual flag");

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.true;
      expect(await quizzdle.flagReason(player1.address)).to.equal("Manual flag");
    });

    it("Should allow server to flag wallet", async function () {
      await quizzdle.connect(server).flagWallet(player1.address, "Server flag");

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.true;
    });

    it("Should reject non-authorized flag attempts", async function () {
      await expect(
        quizzdle.connect(player2).flagWallet(player1.address, "Unauthorized")
      ).to.be.revertedWith("Not authorized");
    });

    it("Should allow owner to unflag wallet", async function () {
      await quizzdle.flagWallet(player1.address, "Test");
      await quizzdle.unflagWallet(player1.address);

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.false;
    });

    it("Should reject server unflag attempts", async function () {
      await quizzdle.flagWallet(player1.address, "Test");

      await expect(
        quizzdle.connect(server).unflagWallet(player1.address)
      ).to.be.revertedWith("Only owner");
    });

    it("Should track total flagged wallets correctly", async function () {
      await quizzdle.flagWallet(player1.address, "Test1");
      await quizzdle.flagWallet(player2.address, "Test2");

      expect(await quizzdle.totalFlaggedWallets()).to.equal(2);

      await quizzdle.unflagWallet(player1.address);

      expect(await quizzdle.totalFlaggedWallets()).to.equal(1);
    });
  });

  describe("Rewards - Flagged Wallets Blocked", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    async function setupWinForPlayer(player: any, shouldFlag: boolean = false) {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        shouldFlag
      );

      await quizzdle.connect(player).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        shouldFlag,
        { value: FEE }
      );
    }

    it("Should block flagged wallet from claiming winner rewards", async function () {
      // Player wins but gets flagged
      await setupWinForPlayer(player1, true);

      // Advance time to next day to finalize
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Another player plays to trigger finalization
      await setupWinForPlayer(player2, false);

      const day = (await getCurrentDay()) - BigInt(1);

      await expect(
        quizzdle.connect(player1).claimWinnerRewards(day)
      ).to.be.revertedWith("Wallet flagged for abuse");
    });

    it("Should allow clean wallet to claim winner rewards", async function () {
      // Player wins without flag
      await setupWinForPlayer(player1, false);

      // Advance time to next day
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Another player plays to trigger finalization
      await setupWinForPlayer(player2, false);

      const day = (await getCurrentDay()) - BigInt(1);

      // Should not revert
      await quizzdle.connect(player1).claimWinnerRewards(day);
    });

    it("Should block flagged wallet from claiming referral rewards", async function () {
      // Setup: player1 creates a referral code, player2 uses it
      await referral.connect(player1).setReferralCode("PLAYER1");
      await referral.connect(player2).registerWithReferral("PLAYER1");

      // Player2 plays (generates referral reward for player1)
      await setupWinForPlayer(player2, false);

      // Flag player1
      await quizzdle.flagWallet(player1.address, "Abuse");

      await expect(
        quizzdle.connect(player1).claimReferralRewards()
      ).to.be.revertedWith("Wallet flagged for abuse");
    });
  });

  describe("Withdraw Function", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should allow owner to withdraw non-reserved funds", async function () {
      // Generate some revenue
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      const largerFee = ethers.parseEther("0.01");
      await quizzdle.setFee(largerFee);

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: largerFee }
      );

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      await quizzdle.withdraw(owner.address);

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      // Balance should increase (minus gas)
      expect(ownerBalanceAfter).to.be.greaterThan(ownerBalanceBefore);
    });

    it("Should reject non-owner withdraw", async function () {
      await expect(
        quizzdle.connect(player1).withdraw(player1.address)
      ).to.be.revertedWith("Only owner");
    });

    it("Should reject withdraw to zero address", async function () {
      await expect(
        quizzdle.withdraw(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });
  });

  describe("View Functions", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should return correct user session data", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      const session = await quizzdle.getUserSession(player1.address, COLLECTION_ID, currentDay);
      expect(session.commitment).to.equal(commitment);
      expect(session.hasWonToday).to.be.true;
      expect(session.attemptsToday).to.equal(1);
    });

    it("Should return correct commitment", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        createSaltedHash(99, SESSION_SIG, SALT), // Wrong guess
        commitment,
        signature,
        false,
        { value: FEE }
      );

      expect(await quizzdle.getCommitment(player1.address, COLLECTION_ID)).to.equal(commitment);
    });

    it("Should return player daily guesses", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      // Make 2 wrong guesses
      for (let i = 0; i < 2; i++) {
        await quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          createSaltedHash(i + 1, SESSION_SIG, SALT),
          commitment,
          signature,
          false,
          { value: FEE }
        );
      }

      const guesses = await quizzdle.getPlayerDailyGuesses(player1.address, COLLECTION_ID, currentDay);
      expect(guesses.length).to.equal(2);
      expect(guesses[0].isCorrect).to.be.false;
      expect(guesses[1].isCorrect).to.be.false;
    });

    it("Should return wallet flag status", async function () {
      await quizzdle.flagWallet(player1.address, "Test reason");

      const [flagged, reason] = await quizzdle.isWalletFlagged(player1.address);
      expect(flagged).to.be.true;
      expect(reason).to.equal("Test reason");
    });
  });

  describe("Referral Integration", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should credit referral rewards", async function () {
      // Player1 creates referral code, Player2 uses it
      await referral.connect(player1).setReferralCode("PLAYER1CODE");
      await referral.connect(player2).registerWithReferral("PLAYER1CODE");

      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player2.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      const largerFee = ethers.parseEther("0.01");
      await quizzdle.setFee(largerFee);

      await quizzdle.connect(player2).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: largerFee }
      );

      // 10% referral
      const expectedReferral = largerFee / BigInt(10);
      expect(await quizzdle.referralRewards(player1.address)).to.equal(expectedReferral);
    });
  });

  describe("Stats Tracking", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should track global stats correctly", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);

      const signature1 = await signCommitment(server, player1.address, COLLECTION_ID, currentDay, commitment, false);
      const signature2 = await signCommitment(server, player2.address, COLLECTION_ID, currentDay, commitment, false);

      await quizzdle.connect(player1).submitSaltedGuess(COLLECTION_ID, commitment, commitment, signature1, false, { value: FEE });
      await quizzdle.connect(player2).submitSaltedGuess(COLLECTION_ID, commitment, commitment, signature2, false, { value: FEE });

      expect(await quizzdle.globalTotalWins()).to.equal(2);
      expect(await quizzdle.globalTotalPaid()).to.equal(FEE * BigInt(2));
      expect(await quizzdle.totalWinsPerDay(currentDay)).to.equal(2);
    });

    it("Should track per-player stats correctly", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(server, player1.address, COLLECTION_ID, currentDay, commitment, false);

      // 3 wrong guesses then correct
      for (let i = 0; i < 3; i++) {
        await quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          createSaltedHash(i + 1, SESSION_SIG, SALT),
          commitment,
          signature,
          false,
          { value: FEE }
        );
      }

      await quizzdle.connect(player1).submitSaltedGuess(COLLECTION_ID, commitment, commitment, signature, false, { value: FEE });

      expect(await quizzdle.totalWins(player1.address)).to.equal(1);
      expect(await quizzdle.winsPerCollection(player1.address, COLLECTION_ID)).to.equal(1);
      expect(await quizzdle.totalPaid(player1.address)).to.equal(FEE * BigInt(4));
    });
  });

  describe("Daily Bonus / Incentives", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;
    const BONUS_AMOUNT = ethers.parseEther("0.01"); // 10$ en ETH (exemple)

    it("Should allow owner to add bonus to a specific day", async function () {
      const currentDay = await getCurrentDay();
      const targetDay = currentDay + BigInt(1); // tomorrow

      const tx = await quizzdle.connect(owner).addDailyBonus(targetDay, { value: BONUS_AMOUNT });

      await expect(tx).to.emit(quizzdle, "DailyBonusAdded")
        .withArgs(targetDay, BONUS_AMOUNT, owner.address);

      const [totalPool, winnersPool] = await quizzdle.getDayPool(targetDay);
      expect(totalPool).to.equal(BONUS_AMOUNT);
      // Bonus goes 100% to winners pool (45% only applies to revenue)
      expect(winnersPool).to.equal(BONUS_AMOUNT);
    });

    it("Should allow owner to add bonus for tomorrow", async function () {
      const tx = await quizzdle.connect(owner).addBonusForTomorrow({ value: BONUS_AMOUNT });

      const tomorrow = (await getCurrentDay()) + BigInt(1);

      await expect(tx).to.emit(quizzdle, "DailyBonusAdded")
        .withArgs(tomorrow, BONUS_AMOUNT, owner.address);

      const [totalPool, winnersPool, day] = await quizzdle.getTomorrowPool();
      expect(day).to.equal(tomorrow);
      expect(totalPool).to.equal(BONUS_AMOUNT);
    });

    it("Should reject non-owner bonus additions", async function () {
      const tomorrow = (await getCurrentDay()) + BigInt(1);

      await expect(
        quizzdle.connect(player1).addDailyBonus(tomorrow, { value: BONUS_AMOUNT })
      ).to.be.revertedWith("Only owner");

      await expect(
        quizzdle.connect(player1).addBonusForTomorrow({ value: BONUS_AMOUNT })
      ).to.be.revertedWith("Only owner");
    });

    it("Should reject zero ETH bonus", async function () {
      const tomorrow = (await getCurrentDay()) + BigInt(1);

      await expect(
        quizzdle.connect(owner).addDailyBonus(tomorrow, { value: 0 })
      ).to.be.revertedWith("Must send ETH");
    });

    it("Should reject bonus for already finalized day", async function () {
      const currentDay = await getCurrentDay();
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      // Play to generate revenue
      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: FEE }
      );

      // Advance time to next day
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Play on new day to trigger finalization of previous day
      const newDay = await getCurrentDay();
      const newCommitment = createSaltedHash(CHAR_ID + 1, SESSION_SIG, SALT);
      const newSignature = await signCommitment(
        server,
        player2.address,
        COLLECTION_ID,
        newDay,
        newCommitment,
        false
      );

      await quizzdle.connect(player2).submitSaltedGuess(
        COLLECTION_ID,
        newCommitment,
        newCommitment,
        newSignature,
        false,
        { value: FEE }
      );

      // Try to add bonus to finalized day
      await expect(
        quizzdle.connect(owner).addDailyBonus(currentDay, { value: BONUS_AMOUNT })
      ).to.be.revertedWith("Day already finalized");
    });

    it("Should combine bonus with player fees in reward pool", async function () {
      // Add bonus for today
      const currentDay = await getCurrentDay();
      await quizzdle.connect(owner).addDailyBonus(currentDay, { value: BONUS_AMOUNT });

      // Player plays
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG, SALT);
      const signature = await signCommitment(
        server,
        player1.address,
        COLLECTION_ID,
        currentDay,
        commitment,
        false
      );

      const largerFee = ethers.parseEther("0.005");
      await quizzdle.setFee(largerFee);

      await quizzdle.connect(player1).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: largerFee }
      );

      // Check total pool = bonus + fee
      const [totalPool] = await quizzdle.getDayPool(currentDay);
      expect(totalPool).to.equal(BONUS_AMOUNT + largerFee);
    });

    it("Should return correct tomorrow pool info", async function () {
      await quizzdle.connect(owner).addBonusForTomorrow({ value: BONUS_AMOUNT });

      const [totalPool, winnersPool, day] = await quizzdle.getTomorrowPool();
      const tomorrow = (await getCurrentDay()) + BigInt(1);

      expect(day).to.equal(tomorrow);
      expect(totalPool).to.equal(BONUS_AMOUNT);
      // Bonus goes 100% to winners pool (45% only applies to revenue)
      expect(winnersPool).to.equal(BONUS_AMOUNT);
    });
  });

  describe("Claim All Winner Rewards", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;
    const LARGER_FEE = ethers.parseEther("0.01");

    async function setupWinForPlayer(player: any, day: bigint) {
      const commitment = createSaltedHash(CHAR_ID, SESSION_SIG + day.toString(), SALT);
      const signature = await signCommitment(
        server,
        player.address,
        COLLECTION_ID,
        day,
        commitment,
        false
      );

      await quizzdle.connect(player).submitSaltedGuess(
        COLLECTION_ID,
        commitment,
        commitment,
        signature,
        false,
        { value: LARGER_FEE }
      );
    }

    beforeEach(async function () {
      await quizzdle.setFee(LARGER_FEE);
    });

    it("Should return correct total pending rewards", async function () {
      // Day 1: player1 wins
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1, day1);

      // Advance to Day 2
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Day 2: another player plays to finalize Day 1
      const day2 = await getCurrentDay();
      await setupWinForPlayer(player2, day2);

      // Check total pending for player1
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);

      expect(unclaimedDays).to.equal(1);
      expect(totalPending).to.be.greaterThan(0);

      // Verify it matches getPendingWinnerRewards for day1
      const day1Pending = await quizzdle.getPendingWinnerRewards(player1.address, day1);
      expect(totalPending).to.equal(day1Pending);
    });

    it("Should claim all rewards from multiple days in one transaction", async function () {
      // Day 1: player1 wins
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1, day1);

      // Advance to Day 2
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Day 2: player1 wins again + finalize Day 1
      const day2 = await getCurrentDay();
      await setupWinForPlayer(player1, day2);

      // Advance to Day 3
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Day 3: another player plays to finalize Day 2
      const day3 = await getCurrentDay();
      await setupWinForPlayer(player2, day3);

      // Check total pending for player1 (should have 2 days)
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(unclaimedDays).to.equal(2);
      expect(totalPending).to.be.greaterThan(0);

      // Claim all
      const balanceBefore = await ethers.provider.getBalance(player1.address);
      const tx = await quizzdle.connect(player1).claimAllWinnerRewards(30);
      const receipt = await tx.wait();

      const balanceAfter = await ethers.provider.getBalance(player1.address);
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      expect(netReceived).to.equal(totalPending);

      // Verify both days are now claimed
      expect(await quizzdle.claimedDays(player1.address, day1)).to.be.true;
      expect(await quizzdle.claimedDays(player1.address, day2)).to.be.true;

      // Verify no more pending
      const [newTotalPending, newUnclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(newUnclaimedDays).to.equal(0);
      expect(newTotalPending).to.equal(0);
    });

    it("Should revert if no rewards to claim", async function () {
      await expect(
        quizzdle.connect(player1).claimAllWinnerRewards(30)
      ).to.be.revertedWith("No rewards to claim");
    });

    it("Should block flagged wallets from claiming all rewards", async function () {
      // Day 1: player1 wins
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1, day1);

      // Advance to Day 2
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Trigger finalization
      const day2 = await getCurrentDay();
      await setupWinForPlayer(player2, day2);

      // Flag player1
      await quizzdle.flagWallet(player1.address, "Test flag");

      // Try to claim all
      await expect(
        quizzdle.connect(player1).claimAllWinnerRewards(30)
      ).to.be.revertedWith("Wallet flagged for abuse");
    });

    it("Should respect maxDaysToCheck parameter", async function () {
      // Day 1: player1 wins
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1, day1);

      // Advance to Day 2
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Day 2: player1 wins + finalize Day 1
      const day2 = await getCurrentDay();
      await setupWinForPlayer(player1, day2);

      // Advance to Day 3
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Trigger Day 2 finalization
      const day3 = await getCurrentDay();
      await setupWinForPlayer(player2, day3);

      // With maxDaysToCheck = 1, should only get Day 2 rewards
      const [totalPending1, unclaimedDays1] = await quizzdle.getTotalPendingRewards(player1.address, 1);
      expect(unclaimedDays1).to.equal(1);

      // With maxDaysToCheck = 30, should get both days
      const [totalPending30, unclaimedDays30] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(unclaimedDays30).to.equal(2);
      expect(totalPending30).to.be.greaterThan(totalPending1);
    });

    it("Should skip already claimed days", async function () {
      // Day 1: player1 wins
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1, day1);

      // Advance to Day 2
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Trigger finalization + play day 2
      const day2 = await getCurrentDay();
      await setupWinForPlayer(player1, day2);

      // Claim Day 1 individually
      await quizzdle.connect(player1).claimWinnerRewards(day1);

      // Advance to Day 3
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      // Trigger Day 2 finalization
      const day3 = await getCurrentDay();
      await setupWinForPlayer(player2, day3);

      // Total pending should only show Day 2 (Day 1 already claimed)
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(unclaimedDays).to.equal(1);

      // Claim remaining
      const day2Pending = await quizzdle.getPendingWinnerRewards(player1.address, day2);
      expect(totalPending).to.equal(day2Pending);
    });

    it("Should return zero for player with no wins", async function () {
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(totalPending).to.equal(0);
      expect(unclaimedDays).to.equal(0);
    });

    it("Should skip unfinalized days", async function () {
      // Day 1: player1 wins (not finalized yet)
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1, day1);

      // Don't advance time - day is not finalized

      // Should return 0 pending (day not finalized)
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(totalPending).to.equal(0);
      expect(unclaimedDays).to.equal(0);
    });
  });
});
