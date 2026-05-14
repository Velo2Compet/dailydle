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

  async function getCurrentDay(): Promise<bigint> {
    const block = await ethers.provider.getBlock("latest");
    return BigInt(Math.floor(block.timestamp / 86400));
  }

  // Mirrors the on-chain saltedGuess derivation used by the API
  function makeSaltedGuess(characterId: number, sessionSig: string, salt: string): string {
    return ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "string", "string"],
        [characterId, sessionSig, salt]
      )
    );
  }

  // Server-side attestation (must match Quizzdle.sol's hash exactly)
  async function signGuessAttestation(
    signer: any,
    contractAddress: string,
    playerAddress: string,
    collectionId: number,
    day: bigint,
    saltedGuess: string,
    isCorrect: boolean,
    shouldFlag: boolean
  ): Promise<string> {
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["address", "address", "uint256", "uint256", "bytes32", "bool", "bool"],
        [contractAddress, playerAddress, collectionId, day, saltedGuess, isCorrect, shouldFlag]
      )
    );
    return signer.signMessage(ethers.getBytes(messageHash));
  }

  async function submit(
    player: any,
    {
      collectionId = COLLECTION_ID,
      saltedGuess,
      isCorrect,
      shouldFlag = false,
      value = FEE,
      signer = server,
    }: {
      collectionId?: number;
      saltedGuess: string;
      isCorrect: boolean;
      shouldFlag?: boolean;
      value?: bigint;
      signer?: any;
    }
  ) {
    const day = await getCurrentDay();
    const sig = await signGuessAttestation(
      signer,
      await quizzdle.getAddress(),
      player.address,
      collectionId,
      day,
      saltedGuess,
      isCorrect,
      shouldFlag
    );
    return quizzdle
      .connect(player)
      .submitSaltedGuess(collectionId, saltedGuess, isCorrect, shouldFlag, sig, { value });
  }

  beforeEach(async function () {
    [owner, server, player1, player2, player3] = await ethers.getSigners();

    const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
    quizzdle = await QuizzdleFactory.deploy();
    await quizzdle.waitForDeployment();

    const QuizzdleReferalFactory = await ethers.getContractFactory("QuizzdleReferal");
    referral = await QuizzdleReferalFactory.deploy();
    await referral.waitForDeployment();

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
      const saltedGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const tx = await submit(player1, { saltedGuess, isCorrect: true });

      await expect(tx).to.emit(quizzdle, "SaltedGuessMade");
      await expect(tx).to.emit(quizzdle, "WinRecorded");

      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.true;
    });

    it("Should record incorrect guess without win", async function () {
      const saltedGuess = makeSaltedGuess(WRONG_CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: false });

      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.false;
      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(1);
    });

    it("Should reject invalid server signature", async function () {
      const saltedGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);

      // Sign with the wrong key (player1 instead of server)
      await expect(
        submit(player1, { saltedGuess, isCorrect: true, signer: player1 })
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject a flipped isCorrect bit (signature mismatch)", async function () {
      // Server signs isCorrect=false, user tries to submit isCorrect=true
      const saltedGuess = makeSaltedGuess(WRONG_CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      const sig = await signGuessAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        false, // signed false
        false
      );
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          true, // user flips it
          false,
          sig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should prevent the old commitment-leak exploit (no free wins)", async function () {
      // Past attack: pass commitment as both saltedGuess and _commitment.
      // New design: there is no public commitment; the user can never claim
      // isCorrect=true without a server signature attesting it.
      const saltedGuess = makeSaltedGuess(WRONG_CHAR_ID, SESSION_SIG, SALT);

      // The user has only a "wrong" attestation and tries to lie about it
      const day = await getCurrentDay();
      const wrongSig = await signGuessAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        false,
        false
      );
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          true,
          false,
          wrongSig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject signature replay across contracts (address bound)", async function () {
      // Deploy a second Quizzdle and sign for it; the original contract must reject.
      const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
      const other = await QuizzdleFactory.deploy();
      await other.waitForDeployment();

      const saltedGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      const sig = await signGuessAttestation(
        server,
        await other.getAddress(), // signed for the OTHER contract
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        true,
        false
      );

      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          true,
          false,
          sig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject insufficient fee", async function () {
      const saltedGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      await expect(
        submit(player1, { saltedGuess, isCorrect: true, value: 0n })
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should reject non-existent collection", async function () {
      const saltedGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      await expect(
        submit(player1, { saltedGuess, isCorrect: true, collectionId: 999 })
      ).to.be.revertedWith("Collection does not exist");
    });

    it("Should reject playing after already winning", async function () {
      const saltedGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true });

      await expect(
        submit(player1, { saltedGuess, isCorrect: true })
      ).to.be.revertedWith("Already won today");
    });

    it("Should allow multiple wrong guesses before winning", async function () {
      for (let i = 0; i < 3; i++) {
        const wrongGuess = makeSaltedGuess(WRONG_CHAR_ID + i, SESSION_SIG, SALT);
        await submit(player1, { saltedGuess: wrongGuess, isCorrect: false });
      }
      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(3);
      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.false;

      const correctGuess = makeSaltedGuess(CORRECT_CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess: correctGuess, isCorrect: true });

      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(4);
      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.true;
    });
  });

  describe("Auto-Flag Mechanism (shouldFlag)", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should auto-flag wallet when shouldFlag is true", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const tx = await submit(player1, { saltedGuess, isCorrect: true, shouldFlag: true });

      await expect(tx).to.emit(quizzdle, "WalletFlagged")
        .withArgs(player1.address, "Multi-wallet detected");

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.true;
      expect(await quizzdle.flagReason(player1.address)).to.equal("Multi-wallet detected");
    });

    it("Should not flag wallet when shouldFlag is false", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true, shouldFlag: false });
      expect(await quizzdle.flaggedWallets(player1.address)).to.be.false;
    });

    it("Should reject mismatched shouldFlag (signature bound)", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      const sig = await signGuessAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        true,
        false // signed shouldFlag=false
      );
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          true,
          true, // user submits true
          sig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should not double-flag already flagged wallet", async function () {
      const wrong = makeSaltedGuess(0, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess: wrong, isCorrect: false, shouldFlag: true });
      const flaggedBefore = await quizzdle.totalFlaggedWallets();

      const correct = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess: correct, isCorrect: true, shouldFlag: true });
      const flaggedAfter = await quizzdle.totalFlaggedWallets();

      expect(flaggedAfter).to.equal(flaggedBefore);
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
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player, { saltedGuess, isCorrect: true, shouldFlag });
    }

    it("Should block flagged wallet from claiming winner rewards", async function () {
      await setupWinForPlayer(player1, true);
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player2, false);

      const day = (await getCurrentDay()) - 1n;
      await expect(
        quizzdle.connect(player1).claimWinnerRewards(day)
      ).to.be.revertedWith("Wallet flagged for abuse");
    });

    it("Should allow clean wallet to claim winner rewards", async function () {
      await setupWinForPlayer(player1, false);
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player2, false);

      const day = (await getCurrentDay()) - 1n;
      await quizzdle.connect(player1).claimWinnerRewards(day);
    });

    it("Should block flagged wallet from claiming referral rewards", async function () {
      await referral.connect(player1).setReferralCode("PLAYER1");
      await referral.connect(player2).registerWithReferral("PLAYER1");

      await setupWinForPlayer(player2, false);
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
      const largerFee = ethers.parseEther("0.01");
      await quizzdle.setFee(largerFee);
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true, value: largerFee });

      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);
      await quizzdle.withdraw(owner.address);
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
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
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true });

      const day = await getCurrentDay();
      const session = await quizzdle.getUserSession(player1.address, COLLECTION_ID, day);
      expect(session.hasWonToday).to.be.true;
      expect(session.attemptsToday).to.equal(1);
    });

    it("Should return player daily guesses", async function () {
      for (let i = 0; i < 2; i++) {
        const wrong = makeSaltedGuess(i + 1, SESSION_SIG, SALT);
        await submit(player1, { saltedGuess: wrong, isCorrect: false });
      }
      const day = await getCurrentDay();
      const guesses = await quizzdle.getPlayerDailyGuesses(player1.address, COLLECTION_ID, day);
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
      await referral.connect(player1).setReferralCode("PLAYER1CODE");
      await referral.connect(player2).registerWithReferral("PLAYER1CODE");

      const largerFee = ethers.parseEther("0.01");
      await quizzdle.setFee(largerFee);

      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player2, { saltedGuess, isCorrect: true, value: largerFee });

      const expectedReferral = largerFee / 10n;
      expect(await quizzdle.referralRewards(player1.address)).to.equal(expectedReferral);
    });
  });

  describe("Stats Tracking", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should track global stats correctly", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true });
      await submit(player2, { saltedGuess, isCorrect: true });

      const day = await getCurrentDay();
      expect(await quizzdle.globalTotalWins()).to.equal(2);
      expect(await quizzdle.globalTotalPaid()).to.equal(FEE * 2n);
      expect(await quizzdle.totalWinsPerDay(day)).to.equal(2);
    });

    it("Should track per-player stats correctly", async function () {
      for (let i = 0; i < 3; i++) {
        const wrong = makeSaltedGuess(i + 1, SESSION_SIG, SALT);
        await submit(player1, { saltedGuess: wrong, isCorrect: false });
      }
      const correct = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess: correct, isCorrect: true });

      expect(await quizzdle.totalWins(player1.address)).to.equal(1);
      expect(await quizzdle.winsPerCollection(player1.address, COLLECTION_ID)).to.equal(1);
      expect(await quizzdle.totalPaid(player1.address)).to.equal(FEE * 4n);
    });
  });

  describe("Daily Bonus / Incentives", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;
    const BONUS_AMOUNT = ethers.parseEther("0.01");

    it("Should allow owner to add bonus to a specific day", async function () {
      const targetDay = (await getCurrentDay()) + 1n;
      const tx = await quizzdle.connect(owner).addDailyBonus(targetDay, { value: BONUS_AMOUNT });
      await expect(tx).to.emit(quizzdle, "DailyBonusAdded").withArgs(targetDay, BONUS_AMOUNT, owner.address);

      const [totalPool, winnersPool] = await quizzdle.getDayPool(targetDay);
      expect(totalPool).to.equal(BONUS_AMOUNT);
      expect(winnersPool).to.equal(BONUS_AMOUNT);
    });

    it("Should allow owner to add bonus for tomorrow", async function () {
      const tx = await quizzdle.connect(owner).addBonusForTomorrow({ value: BONUS_AMOUNT });
      const tomorrow = (await getCurrentDay()) + 1n;
      await expect(tx).to.emit(quizzdle, "DailyBonusAdded").withArgs(tomorrow, BONUS_AMOUNT, owner.address);

      const [totalPool, , day] = await quizzdle.getTomorrowPool();
      expect(day).to.equal(tomorrow);
      expect(totalPool).to.equal(BONUS_AMOUNT);
    });

    it("Should reject non-owner bonus additions", async function () {
      const tomorrow = (await getCurrentDay()) + 1n;
      await expect(
        quizzdle.connect(player1).addDailyBonus(tomorrow, { value: BONUS_AMOUNT })
      ).to.be.revertedWith("Only owner");
      await expect(
        quizzdle.connect(player1).addBonusForTomorrow({ value: BONUS_AMOUNT })
      ).to.be.revertedWith("Only owner");
    });

    it("Should reject zero ETH bonus", async function () {
      const tomorrow = (await getCurrentDay()) + 1n;
      await expect(
        quizzdle.connect(owner).addDailyBonus(tomorrow, { value: 0 })
      ).to.be.revertedWith("Must send ETH");
    });

    it("Should reject bonus for already finalized day", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const today = await getCurrentDay();
      await submit(player1, { saltedGuess, isCorrect: true });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);

      const newGuess = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await submit(player2, { saltedGuess: newGuess, isCorrect: true });

      await expect(
        quizzdle.connect(owner).addDailyBonus(today, { value: BONUS_AMOUNT })
      ).to.be.revertedWith("Day already finalized");
    });

    it("Should combine bonus with player fees in reward pool", async function () {
      const today = await getCurrentDay();
      await quizzdle.connect(owner).addDailyBonus(today, { value: BONUS_AMOUNT });

      const largerFee = ethers.parseEther("0.005");
      await quizzdle.setFee(largerFee);

      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true, value: largerFee });

      const [totalPool] = await quizzdle.getDayPool(today);
      expect(totalPool).to.equal(BONUS_AMOUNT + largerFee);
    });
  });

  describe("finalizeDay (public)", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should reject finalizing the current/future day", async function () {
      const today = await getCurrentDay();
      await expect(quizzdle.finalizeDay(today)).to.be.revertedWith("Day not finished");
      await expect(quizzdle.finalizeDay(today + 5n)).to.be.revertedWith("Day not finished");
    });

    it("Should allow anyone to finalize a past day so winners can claim", async function () {
      // Day N: player1 wins
      const day1 = await getCurrentDay();
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true });

      // Skip 2 days WITHOUT anyone playing — without the public finalize,
      // day1 would stay forever unfinalized.
      await ethers.provider.send("evm_increaseTime", [86400 * 2]);
      await ethers.provider.send("evm_mine", []);

      // Anyone (here player3) can finalize the past day
      await quizzdle.connect(player3).finalizeDay(day1);
      expect(await quizzdle.dayFinalized(day1)).to.be.true;

      // Winners can now claim
      await quizzdle.connect(player1).claimWinnerRewards(day1);
    });

    it("Should be idempotent (rejects double finalization)", async function () {
      const day1 = await getCurrentDay();
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player1, { saltedGuess, isCorrect: true });

      await ethers.provider.send("evm_increaseTime", [86400 * 2]);
      await ethers.provider.send("evm_mine", []);

      await quizzdle.finalizeDay(day1);
      await expect(quizzdle.finalizeDay(day1)).to.be.revertedWith("Already finalized");
    });
  });

  describe("Claim All Winner Rewards", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;
    const LARGER_FEE = ethers.parseEther("0.01");

    async function setupWinForPlayer(player: any) {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await submit(player, { saltedGuess, isCorrect: true, value: LARGER_FEE });
    }

    beforeEach(async function () {
      await quizzdle.setFee(LARGER_FEE);
    });

    it("Should return correct total pending rewards", async function () {
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1);

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player2);

      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(unclaimedDays).to.equal(1);
      expect(totalPending).to.be.greaterThan(0);
      expect(totalPending).to.equal(await quizzdle.getPendingWinnerRewards(player1.address, day1));
    });

    it("Should claim all rewards from multiple days in one transaction", async function () {
      const day1 = await getCurrentDay();
      await setupWinForPlayer(player1);

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const day2 = await getCurrentDay();
      await setupWinForPlayer(player1);

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player2);

      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(unclaimedDays).to.equal(2);
      expect(totalPending).to.be.greaterThan(0);

      const balanceBefore = await ethers.provider.getBalance(player1.address);
      const tx = await quizzdle.connect(player1).claimAllWinnerRewards(30);
      const receipt = await tx.wait();
      const balanceAfter = await ethers.provider.getBalance(player1.address);
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const netReceived = balanceAfter - balanceBefore + gasUsed;

      expect(netReceived).to.equal(totalPending);
      expect(await quizzdle.claimedDays(player1.address, day1)).to.be.true;
      expect(await quizzdle.claimedDays(player1.address, day2)).to.be.true;

      const [newPending] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(newPending).to.equal(0);
    });

    it("Should revert if no rewards to claim", async function () {
      await expect(
        quizzdle.connect(player1).claimAllWinnerRewards(30)
      ).to.be.revertedWith("No rewards to claim");
    });

    it("Should block flagged wallets from claiming all rewards", async function () {
      await setupWinForPlayer(player1);
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player2);

      await quizzdle.flagWallet(player1.address, "Test flag");
      await expect(
        quizzdle.connect(player1).claimAllWinnerRewards(30)
      ).to.be.revertedWith("Wallet flagged for abuse");
    });

    it("Should respect maxDaysToCheck parameter", async function () {
      await setupWinForPlayer(player1);
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player1);
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      await setupWinForPlayer(player2);

      const [, count1] = await quizzdle.getTotalPendingRewards(player1.address, 1);
      const [, count30] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(count1).to.equal(1);
      expect(count30).to.equal(2);
    });

    it("Should return zero for player with no wins", async function () {
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(totalPending).to.equal(0);
      expect(unclaimedDays).to.equal(0);
    });

    it("Should skip unfinalized days", async function () {
      await setupWinForPlayer(player1);
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(totalPending).to.equal(0);
      expect(unclaimedDays).to.equal(0);
    });
  });
});
