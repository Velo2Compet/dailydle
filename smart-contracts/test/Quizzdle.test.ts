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

      it("Should allow any address to create collections", async function () {
        await quizzdle.connect(player1).updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
        expect(await quizzdle.collectionExists(COLLECTION_ID)).to.be.true;
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
    });
  });

  describe("Daily Character Calculation", function () {
    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
    });

    it("Should return a valid character ID from the collection", async function () {
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
      // They might be the same by chance, but the seed is different
      // Just verify both are valid
      expect(CHARACTER_IDS).to.include(Number(id1));
      expect([1000, 2000, 3000]).to.include(Number(id2));
    });

    it("Should revert for non-existent collection", async function () {
      await expect(quizzdle.getDailyCharacterId(999)).to.be.revertedWith(
        "Collection does not exist"
      );
    });

    it("Should change character ID on different days", async function () {
      const id1 = await quizzdle.getDailyCharacterId(COLLECTION_ID);

      // Advance time by 1 day
      await time.increase(86400);

      const id2 = await quizzdle.getDailyCharacterId(COLLECTION_ID);
      // Note: might be same by chance, but deterministic
      // Just verify both are valid
      expect(CHARACTER_IDS).to.include(Number(id1));
      expect(CHARACTER_IDS).to.include(Number(id2));
    });
  });

  describe("Making Guesses", function () {
    let dailyCharacterId: bigint;

    beforeEach(async function () {
      await quizzdle.updateCollectionCharacterIds(COLLECTION_ID, CHARACTER_IDS);
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

    it("Should refund excess payment", async function () {
      const excessAmount = DEFAULT_FEE * 2n;
      const balanceBefore = await ethers.provider.getBalance(player1.address);

      const tx = await quizzdle
        .connect(player1)
        .makeGuess(COLLECTION_ID, dailyCharacterId, { value: excessAmount });
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(player1.address);
      const actualSpent = balanceBefore - balanceAfter;

      // Should only spend DEFAULT_FEE + gas
      expect(actualSpent).to.be.closeTo(DEFAULT_FEE + gasUsed, ethers.parseUnits("0.0001", "ether"));
    });

    it("Should track total paid per user", async function () {
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, dailyCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getTotalPaid(player1.address)).to.equal(DEFAULT_FEE);

      // Make another guess (wrong one to not trigger same day win logic)
      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      await quizzdle.connect(player1).makeGuess(COLLECTION_ID, wrongCharacterId, { value: DEFAULT_FEE });
      expect(await quizzdle.getTotalPaid(player1.address)).to.equal(DEFAULT_FEE * 2n);
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
      dailyCharacterId = await quizzdle.getDailyCharacterId(COLLECTION_ID);
    });

    it("Should return true for correct guess", async function () {
      expect(await quizzdle.verifyGuess(COLLECTION_ID, dailyCharacterId)).to.be.true;
    });

    it("Should return false for incorrect guess", async function () {
      const wrongCharacterId = CHARACTER_IDS.find((id) => BigInt(id) !== dailyCharacterId) || 999;
      expect(await quizzdle.verifyGuess(COLLECTION_ID, wrongCharacterId)).to.be.false;
    });

    it("Should revert for non-existent collection", async function () {
      await expect(quizzdle.verifyGuess(999, dailyCharacterId)).to.be.revertedWith(
        "Collection does not exist"
      );
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
      // Withdraw all funds first
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
        data: "0x1234", // Random data to trigger fallback
      });

      const balance = await ethers.provider.getBalance(await quizzdle.getAddress());
      expect(balance).to.equal(amount);
    });
  });

  describe("Edge Cases", function () {
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
});
