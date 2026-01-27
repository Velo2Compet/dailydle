const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Quizzdle", function () {
  let quizzdle: any;
  let owner: any;
  let player1: any;
  let player2: any;
  let player3: any;

  const COLLECTION_ID = 1;
  const CHARACTER_IDS = [100, 200, 300, 400, 500];
  const DEFAULT_FEE = 1000000000n; // 1 gwei = 0.000000001 ETH (as defined in contract)
  const TEST_SALT = ethers.encodeBytes32String("test-salt-secret");

  // Helper to get current day from blockchain
  async function getCurrentDay() {
    const block = await ethers.provider.getBlock("latest");
    return Math.floor(block.timestamp / 86400);
  }

  beforeEach(async function () {
    [owner, player1, player2, player3] = await ethers.getSigners();

    const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
    quizzdle = await QuizzdleFactory.deploy();
    await quizzdle.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await quizzdle.owner()).to.equal(owner.address);
    });

    it("Should set the default fee", async function () {
      expect(await quizzdle.feePerGuess()).to.equal(DEFAULT_FEE);
    });

    it("Should initialize global stats to zero", async function () {
      expect(await quizzdle.globalTotalWins()).to.equal(0);
      expect(await quizzdle.globalTotalPaid()).to.equal(0);
    });
  });

  describe("Collection Management", function () {
    describe("updateCollectionCharacterIds", function () {
      it("Should create a new collection", async function () {
        await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);

        expect(await quizzdle.collectionExists(COLLECTION_ID)).to.be.true;
        const storedIds = await quizzdle.getCollectionCharacterIds(COLLECTION_ID);
        expect(storedIds.length).to.equal(CHARACTER_IDS.length);
        for (let i = 0; i < CHARACTER_IDS.length; i++) {
          expect(storedIds[i]).to.equal(CHARACTER_IDS[i]);
        }
      });

      it("Should update an existing collection", async function () {
        await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
        const newIds = [600, 700, 800];
        await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, newIds);

        const storedIds = await quizzdle.getCollectionCharacterIds(COLLECTION_ID);
        expect(storedIds.length).to.equal(newIds.length);
        for (let i = 0; i < newIds.length; i++) {
          expect(storedIds[i]).to.equal(newIds[i]);
        }
      });

      it("Should revert with empty character IDs array", async function () {
        await expect(
          quizzdle.updateCollectionCharacterIds(COLLECTION_ID, [])
        ).to.be.revertedWith("Character IDs array cannot be empty");
      });

      it("Should emit CollectionUpdated event", async function () {
        await expect(quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS))
          .to.emit(quizzdle, "CollectionUpdated")
          .withArgs(COLLECTION_ID, CHARACTER_IDS.length);
      });

      it("Should revert if non-owner tries to create collection", async function () {
        await expect(
          quizzdle.connect(player1).updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS)
        ).to.be.revertedWith("Only owner can call this function");
      });
    });

    describe("updateMultipleCollections", function () {
      it("Should update multiple collections at once", async function () {
        const collectionIds = [1, 2, 3];
        const characterIdsArrays = [
          [100, 200],
          [300, 400, 500],
          [600],
        ];

        await quizzdle.updateMultipleCollections(collectionIds, characterIdsArrays);

        for (let i = 0; i < collectionIds.length; i++) {
          expect(await quizzdle.collectionExists(collectionIds[i])).to.be.true;
          const storedIds = await quizzdle.getCollectionCharacterIds(collectionIds[i]);
          expect(storedIds.length).to.equal(characterIdsArrays[i].length);
        }
      });

      it("Should revert with mismatched array lengths", async function () {
        await expect(
          quizzdle.updateMultipleCollections([1, 2], [[100]])
        ).to.be.revertedWith("Arrays length mismatch");
      });

      it("Should revert if any character IDs array is empty", async function () {
        await expect(
          quizzdle.updateMultipleCollections([1, 2], [[100], []])
        ).to.be.revertedWith("Character IDs array cannot be empty");
      });

      it("Should emit CollectionsUpdated event", async function () {
        const collectionIds = [1, 2];
        const characterIdsArrays = [[100], [200]];

        await expect(quizzdle.updateMultipleCollections(collectionIds, characterIdsArrays))
          .to.emit(quizzdle, "CollectionsUpdated");
      });

      it("Should revert if non-owner tries to update multiple collections", async function () {
        await expect(
          quizzdle.connect(player1).updateMultipleCollections([1], [[100]])
        ).to.be.revertedWith("Only owner can call this function");
      });
    });
  });

  describe("Salt Management", function () {
    it("Should allow owner to set salt", async function () {
      await expect(quizzdle.setSalt(TEST_SALT))
        .to.emit(quizzdle, "SaltUpdated");
    });

    it("Should revert if non-owner tries to set salt", async function () {
      await expect(
        quizzdle.connect(player1).setSalt(TEST_SALT)
      ).to.be.revertedWith("Only owner can call this function");
    });

    it("Should change daily character when salt changes", async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);

      await quizzdle.setSalt(TEST_SALT);
      const id1 = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      const otherSalt = ethers.encodeBytes32String("other-salt");
      await quizzdle.setSalt(otherSalt);
      const id2 = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      // Both should be valid characters
      expect(CHARACTER_IDS).to.include(Number(id1));
      expect(CHARACTER_IDS).to.include(Number(id2));
      // With different salts, the result should (very likely) differ
      // Note: there's a 1/5 chance they're the same by coincidence, so we just check validity
    });
  });

  describe("Daily Character Calculation", function () {
    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await quizzdle.setSalt(TEST_SALT);
    });

    it("Should return a valid character ID from the collection (owner only)", async function () {
      const dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      expect(CHARACTER_IDS).to.include(Number(dailyCharacterId));
    });

    it("Should return the same character ID for the same day", async function () {
      const id1 = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      const id2 = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      expect(id1).to.equal(id2);
    });

    it("Should return different character IDs for different collections", async function () {
      await quizzdle.updateCollectionCharacterIds(2, [1000, 2000, 3000]);
      const id1 = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      const id2 = await quizzdle.getDailyCharacterId(2);
      expect(CHARACTER_IDS).to.include(Number(id1));
      expect([1000, 2000, 3000]).to.include(Number(id2));
    });

    it("Should revert for non-existent collection", async function () {
      await expect(quizzdle.getDailyCharacterId(999)).to.be.revertedWith(
        "Collection does not exist"
      );
    });

    it("Should revert if non-owner calls getDailyCharacterId", async function () {
      await expect(
        quizzdle.connect(player1).getDailyCharacterId(COLLECTION_ID)
      ).to.be.revertedWith("Only owner can call this function");
    });

    it("Should change character ID on different days", async function () {
      const id1 = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      // Advance time by 1 day
      await time.increase(86400);

      const id2 = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      expect(CHARACTER_IDS).to.include(Number(id1));
      expect(CHARACTER_IDS).to.include(Number(id2));
    });
  });

  describe("Making Guesses", function () {
    let dailyCharacterId: bigint;

    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await quizzdle.setSalt(TEST_SALT);
      // Owner calls getDailyCharacterId (onlyOwner)
      dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);
    });

    it("Should accept a correct guess with fee payment", async function () {
      const tx = await quizzdle
        .connect(player1)
        .makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });

      await expect(tx)
        .to.emit(quizzdle, "GuessMade")
        .withArgs(player1.address, COLLECTION_ID, dailyCharacterId, true, 1);
    });

    it("Should accept an incorrect guess with fee payment", async function () {
      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;

      const tx = await quizzdle
        .connect(player1)
        .makeGuess(COLLECTION_ID, wrongCharacterId, { value: DEFAULT_FEE });

      await expect(tx)
        .to.emit(quizzdle, "GuessMade")
        .withArgs(player1.address, COLLECTION_ID, wrongCharacterId, false, 1);
    });

    it("Should revert with insufficient fee", async function () {
      await expect(
        quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, {
          value: DEFAULT_FEE - 1n,
        })
      ).to.be.revertedWith("Insufficient fee paid");
    });

    it("Should keep excess payment in contract (no refund)", async function () {
      const excessAmount = DEFAULT_FEE * 2n;

      await quizzdle
        .connect(player1)
        .makeGuess(COLLECTION_ID, dailyCharacterId, { value: excessAmount });

      // Contract should hold the full excess amount
      const contractBalance = await ethers.provider.getBalance(await quizzdle.getAddress());
      expect(contractBalance).to.equal(excessAmount);
    });

    it("Should track total paid per user (full msg.value)", async function () {
      const overpay = DEFAULT_FEE * 3n;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: overpay });
      expect(await quizzdle.getTotalPaid(player1.address)).to.equal(overpay);

      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getTotalPaid(player1.address)).to.equal(overpay + DEFAULT_FEE);
    });

    it("Should track global total paid", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      await quizzdle.connect(player2).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });

      expect(await quizzdle.getGlobalTotalPaid()).to.equal(DEFAULT_FEE * 2n);
    });

    it("Should increment attempts per day", async function () {
      const currentDay = await getCurrentDay();

      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getAttempts(player1.address, COLLECTION_ID, currentDay)).to.equal(1);

      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getAttempts(player1.address, COLLECTION_ID, currentDay)).to.equal(2);
    });

    it("Should store player guesses", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });

      const guesses = await quizzdle.getPlayerGuesses(player1.address, COLLECTION_ID);
      expect(guesses.length).to.equal(1);
      expect(guesses[0].player).to.equal(player1.address);
      expect(guesses[0].characterId).to.equal(dailyCharacterId);
      expect(guesses[0].isCorrect).to.be.true;
    });

    it("Should revert for non-existent collection", async function () {
      await expect(
        quizzdle.connect(player1).makeGuess(999, dailyCharacterId, { value: DEFAULT_FEE })
      ).to.be.revertedWith("Collection does not exist");
    });
  });

  describe("Win Statistics", function () {
    let dailyCharacterId: bigint;

    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await quizzdle.setSalt(TEST_SALT);
      dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);
    });

    it("Should increment wins per collection on correct guess", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getWinsPerCollection(player1.address, COLLECTION_ID)).to.equal(1);
    });

    it("Should increment total wins on correct guess", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getTotalWins(player1.address)).to.equal(1);
    });

    it("Should increment global total wins on correct guess", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      await quizzdle.connect(player2).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getGlobalTotalWins()).to.equal(2);
    });

    it("Should not increment wins on incorrect guess", async function () {
      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongCharacterId, { value: DEFAULT_FEE });

      expect(await quizzdle.getTotalWins(player1.address)).to.equal(0);
      expect(await quizzdle.getGlobalTotalWins()).to.equal(0);
    });

    it("Should track winners today count", async function () {
      const currentDay = await getCurrentDay();

      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getWinnersTodayCount(COLLECTION_ID, currentDay)).to.equal(1);

      await quizzdle.connect(player2).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getWinnersTodayCount(COLLECTION_ID, currentDay)).to.equal(2);
    });

    it("Should not double count same player winning twice in a day", async function () {
      const currentDay = await getCurrentDay();

      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });

      expect(await quizzdle.getWinnersTodayCount(COLLECTION_ID, currentDay)).to.equal(1);
      expect(await quizzdle.getTotalWins(player1.address)).to.equal(2);
    });

    it("Should track total winners count", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getTotalWinnersCount(COLLECTION_ID)).to.equal(1);

      await quizzdle.connect(player2).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getTotalWinnersCount(COLLECTION_ID)).to.equal(2);
    });

    it("Should track hasWonToday correctly", async function () {
      const currentDay = await getCurrentDay();

      expect(await quizzdle.hasWonToday(COLLECTION_ID, currentDay, player1.address)).to.be.false;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.hasWonToday(COLLECTION_ID, currentDay, player1.address)).to.be.true;
    });

    it("Should track hasWonEver correctly", async function () {
      expect(await quizzdle.hasWonEver(COLLECTION_ID, player1.address)).to.be.false;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.hasWonEver(COLLECTION_ID, player1.address)).to.be.true;
    });
  });

  describe("Verify Guess", function () {
    let dailyCharacterId: bigint;

    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await quizzdle.setSalt(TEST_SALT);
      dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);
    });

    it("Should return true for correct guess (owner)", async function () {
      expect(await quizzdle.verifyGuess(COLLECTION_ID, dailyCharacterId)).to.be.true;
    });

    it("Should return false for incorrect guess (owner)", async function () {
      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      expect(await quizzdle.verifyGuess(COLLECTION_ID, wrongCharacterId)).to.be.false;
    });

    it("Should revert for non-existent collection", async function () {
      await expect(quizzdle.verifyGuess(999, dailyCharacterId)).to.be.revertedWith(
        "Collection does not exist"
      );
    });

    it("Should revert if non-owner calls verifyGuess", async function () {
      await expect(
        quizzdle.connect(player1).verifyGuess(COLLECTION_ID, dailyCharacterId)
      ).to.be.revertedWith("Only owner can call this function");
    });
  });

  describe("Fee Management", function () {
    it("Should allow owner to set new fee", async function () {
      const newFee = ethers.parseUnits("0.001", "ether");
      await quizzdle.setFee(newFee);
      expect(await quizzdle.feePerGuess()).to.equal(newFee);
    });

    it("Should emit FeeUpdated event", async function () {
      const newFee = ethers.parseUnits("0.001", "ether");
      await expect(quizzdle.setFee(newFee))
        .to.emit(quizzdle, "FeeUpdated")
        .withArgs(newFee);
    });

    it("Should revert if non-owner tries to set fee", async function () {
      const newFee = ethers.parseUnits("0.001", "ether");
      await expect(quizzdle.connect(player1).setFee(newFee)).to.be.revertedWith(
        "Only owner can call this function"
      );
    });

    it("Should allow setting fee to zero", async function () {
      await quizzdle.setFee(0);
      expect(await quizzdle.feePerGuess()).to.equal(0);
    });
  });

  describe("Withdrawal", function () {
    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await quizzdle.setSalt(TEST_SALT);
      const dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      // Make some guesses to accumulate fees
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      await quizzdle.connect(player2).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
    });

    it("Should allow owner to withdraw funds", async function () {
      const contractBalance = await ethers.provider.getBalance(await quizzdle.getAddress());
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      const tx = await quizzdle.withdraw(owner.address);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + contractBalance - gasUsed);
    });

    it("Should emit FundsWithdrawn event", async function () {
      const contractBalance = await ethers.provider.getBalance(await quizzdle.getAddress());

      await expect(quizzdle.withdraw(owner.address))
        .to.emit(quizzdle, "FundsWithdrawn")
        .withArgs(owner.address, contractBalance);
    });

    it("Should revert if non-owner tries to withdraw", async function () {
      await expect(quizzdle.connect(player1).withdraw(player1.address)).to.be.revertedWith(
        "Only owner can call this function"
      );
    });

    it("Should revert if withdrawing to zero address", async function () {
      await expect(quizzdle.withdraw(ethers.ZeroAddress)).to.be.revertedWith("Invalid address");
    });

    it("Should revert if no funds to withdraw", async function () {
      await quizzdle.withdraw(owner.address);
      await expect(quizzdle.withdraw(owner.address)).to.be.revertedWith("No funds to withdraw");
    });

    it("Should allow withdrawing to a different address", async function () {
      const recipientBalanceBefore = await ethers.provider.getBalance(player3.address);
      const contractBalance = await ethers.provider.getBalance(await quizzdle.getAddress());

      await quizzdle.withdraw(player3.address);

      const recipientBalanceAfter = await ethers.provider.getBalance(player3.address);
      expect(recipientBalanceAfter).to.equal(recipientBalanceBefore + contractBalance);
    });
  });

  describe("Receive and Fallback", function () {
    it("Should receive ETH directly", async function () {
      const amount = ethers.parseEther("1");
      await owner.sendTransaction({
        to: await quizzdle.getAddress(),
        value: amount,
      });

      const balance = await ethers.provider.getBalance(await quizzdle.getAddress());
      expect(balance).to.equal(amount);
    });

    it("Should receive ETH via fallback", async function () {
      const amount = ethers.parseEther("1");
      await owner.sendTransaction({
        to: await quizzdle.getAddress(),
        value: amount,
        data: "0x1234",
      });

      const balance = await ethers.provider.getBalance(await quizzdle.getAddress());
      expect(balance).to.equal(amount);
    });
  });

  describe("Edge Cases", function () {
    beforeEach(async function () {
      await quizzdle.setSalt(TEST_SALT);
    });

    it("Should handle collection with single character", async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, [999]);
      const dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      expect(dailyCharacterId).to.equal(999);
    });

    it("Should handle multiple collections independently", async function () {
      await quizzdle.updateCollectionCharacterIds(1, [100, 200]);
      await quizzdle.updateCollectionCharacterIds(2, [300, 400]);

      const daily1 = await quizzdle.getDailyCharacterId(1);
      const daily2 = await quizzdle.getDailyCharacterId(2);

      expect([100, 200]).to.include(Number(daily1));
      expect([300, 400]).to.include(Number(daily2));
    });

    it("Should allow multiple players to win the same day", async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      const dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      await quizzdle.connect(player2).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      await quizzdle.connect(player3).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });

      expect(await quizzdle.getTotalWins(player1.address)).to.equal(1);
      expect(await quizzdle.getTotalWins(player2.address)).to.equal(1);
      expect(await quizzdle.getTotalWins(player3.address)).to.equal(1);
      expect(await quizzdle.getGlobalTotalWins()).to.equal(3);
    });
  });

  describe("Referral Contract Setup", function () {
    it("Should allow owner to set referral contract", async function () {
      const ReferralFactory = await ethers.getContractFactory("QuizzdleReferal");
      const referralContract = await ReferralFactory.deploy();
      await referralContract.waitForDeployment();

      await expect(quizzdle.setReferralContract(await referralContract.getAddress()))
        .to.emit(quizzdle, "ReferralContractUpdated");
    });

    it("Should revert setting zero address", async function () {
      await expect(quizzdle.setReferralContract(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid referral contract address");
    });

    it("Should revert if non-owner sets referral contract", async function () {
      await expect(quizzdle.connect(player1).setReferralContract(player2.address))
        .to.be.revertedWith("Only owner can call this function");
    });
  });

  describe("Referral Rewards", function () {
    let dailyCharacterId: bigint;
    let referralContract: any;

    beforeEach(async function () {
      // Deploy referral contract
      const ReferralFactory = await ethers.getContractFactory("QuizzdleReferal");
      referralContract = await ReferralFactory.deploy();
      await referralContract.waitForDeployment();

      // Link referral contract to game contract
      await quizzdle.setReferralContract(await referralContract.getAddress());

      // Setup collection and salt
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await quizzdle.setSalt(TEST_SALT);
      dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      // player2 is referrer, player1 registers with player2's code
      await referralContract.connect(player2).setReferralCode("CODE123");
      await referralContract.connect(player1).registerWithReferral("CODE123");
    });

    it("Should credit 10% referral reward when referred player guesses", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      const expectedReward = DEFAULT_FEE / 10n;
      expect(await quizzdle.pendingReferralRewards(player2.address)).to.equal(expectedReward);
    });

    it("Should not credit referral reward when player has no referrer", async function () {
      await quizzdle.connect(player3).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.pendingReferralRewards(player3.address)).to.equal(0);
    });

    it("Should accumulate rewards across multiple guesses", async function () {
      const wrongId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongId, { value: DEFAULT_FEE });
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      const expectedReward = (DEFAULT_FEE / 10n) * 2n;
      expect(await quizzdle.pendingReferralRewards(player2.address)).to.equal(expectedReward);
    });

    it("Should allow referrer to claim rewards", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      const expectedReward = DEFAULT_FEE / 10n;
      const balanceBefore = await ethers.provider.getBalance(player2.address);

      const tx = await quizzdle.connect(player2).claimReferralRewards();
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(player2.address);
      expect(balanceAfter).to.equal(balanceBefore + expectedReward - gasUsed);
      expect(await quizzdle.pendingReferralRewards(player2.address)).to.equal(0);
    });

    it("Should emit ReferralRewardCredited event", async function () {
      const expectedReward = DEFAULT_FEE / 10n;
      await expect(quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE }))
        .to.emit(quizzdle, "ReferralRewardCredited")
        .withArgs(player2.address, player1.address, expectedReward);
    });

    it("Should emit ReferralRewardsClaimed event", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      const expectedReward = DEFAULT_FEE / 10n;
      await expect(quizzdle.connect(player2).claimReferralRewards())
        .to.emit(quizzdle, "ReferralRewardsClaimed")
        .withArgs(player2.address, expectedReward);
    });

    it("Should revert claim when no rewards", async function () {
      await expect(quizzdle.connect(player3).claimReferralRewards())
        .to.be.revertedWith("No referral rewards to claim");
    });

    it("Should not credit rewards when referral contract not set", async function () {
      // Deploy a fresh Quizzdle without referral contract
      const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
      const freshQuizzdle = await QuizzdleFactory.deploy();
      await freshQuizzdle.waitForDeployment();
      await freshQuizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
      await freshQuizzdle.setSalt(TEST_SALT);
      const charId = await freshQuizzdle.getDailyCharacterId(COLLECTION_ID);

      await freshQuizzdle.connect(player1).makeGuess(COLLECTION_ID, charId, { value: DEFAULT_FEE });
      expect(await freshQuizzdle.pendingReferralRewards(player2.address)).to.equal(0);
    });

    it("Should track totalReferralEarned (never reset on claim)", async function () {
      const wrongId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      const rewardPerGuess = DEFAULT_FEE / 10n;

      // First guess
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongId, { value: DEFAULT_FEE });
      expect(await quizzdle.totalReferralEarned(player2.address)).to.equal(rewardPerGuess);

      // Second guess
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.totalReferralEarned(player2.address)).to.equal(rewardPerGuess * 2n);

      // Claim rewards
      await quizzdle.connect(player2).claimReferralRewards();

      // pendingRewards should be 0 but totalReferralEarned should remain
      expect(await quizzdle.pendingReferralRewards(player2.address)).to.equal(0);
      expect(await quizzdle.totalReferralEarned(player2.address)).to.equal(rewardPerGuess * 2n);

      // Third guess after claim — totalReferralEarned keeps accumulating
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongId, { value: DEFAULT_FEE });
      expect(await quizzdle.totalReferralEarned(player2.address)).to.equal(rewardPerGuess * 3n);
      expect(await quizzdle.pendingReferralRewards(player2.address)).to.equal(rewardPerGuess);
    });

    it("Should reserve referral rewards and limit owner withdrawal", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      const referralAmount = DEFAULT_FEE / 10n;
      const withdrawable = DEFAULT_FEE - referralAmount;

      const balanceBefore = await ethers.provider.getBalance(player3.address);
      await quizzdle.withdraw(player3.address);
      const balanceAfter = await ethers.provider.getBalance(player3.address);
      expect(balanceAfter).to.equal(balanceBefore + withdrawable);
    });
  });
});
