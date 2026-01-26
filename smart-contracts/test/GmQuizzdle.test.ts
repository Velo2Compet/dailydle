const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("GmQuizzdle", function () {
  let gmQuizzdle: any;
  let owner: any;
  let player1: any;
  let player2: any;
  let player3: any;

  const ONE_DAY = 86400;

  beforeEach(async function () {
    [owner, player1, player2, player3] = await ethers.getSigners();

    const GmQuizzdleFactory = await ethers.getContractFactory("GmQuizzdle");
    gmQuizzdle = await GmQuizzdleFactory.deploy();
    await gmQuizzdle.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await gmQuizzdle.owner()).to.equal(owner.address);
    });

    it("Should initialize global stats to zero", async function () {
      expect(await gmQuizzdle.totalGmsGlobal()).to.equal(0);
      expect(await gmQuizzdle.uniquePlayers()).to.equal(0);
    });

    it("Should initialize players array to empty", async function () {
      expect(await gmQuizzdle.getPlayersCount()).to.equal(0);
    });
  });

  describe("GM Function", function () {
    it("Should allow a player to say GM", async function () {
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.totalGms(player1.address)).to.equal(1);
    });

    it("Should emit GmSent event", async function () {
      const currentDay = Math.floor(Date.now() / 1000 / ONE_DAY);
      await expect(gmQuizzdle.connect(player1).gm())
        .to.emit(gmQuizzdle, "GmSent")
        .withArgs(player1.address, 1, currentDay);
    });

    it("Should not allow the same player to say GM twice in one day", async function () {
      await gmQuizzdle.connect(player1).gm();
      await expect(gmQuizzdle.connect(player1).gm()).to.be.revertedWith(
        "Already said GM today"
      );
    });

    it("Should allow different players to say GM on the same day", async function () {
      await gmQuizzdle.connect(player1).gm();
      await gmQuizzdle.connect(player2).gm();

      expect(await gmQuizzdle.totalGms(player1.address)).to.equal(1);
      expect(await gmQuizzdle.totalGms(player2.address)).to.equal(1);
    });

    it("Should register new players", async function () {
      expect(await gmQuizzdle.hasPlayedBefore(player1.address)).to.be.false;

      await gmQuizzdle.connect(player1).gm();

      expect(await gmQuizzdle.hasPlayedBefore(player1.address)).to.be.true;
      expect(await gmQuizzdle.uniquePlayers()).to.equal(1);
    });

    it("Should add player to players array", async function () {
      await gmQuizzdle.connect(player1).gm();
      await gmQuizzdle.connect(player2).gm();

      expect(await gmQuizzdle.getPlayersCount()).to.equal(2);
      expect(await gmQuizzdle.players(0)).to.equal(player1.address);
      expect(await gmQuizzdle.players(1)).to.equal(player2.address);
    });

    it("Should increment global GM counter", async function () {
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.totalGmsGlobal()).to.equal(1);

      await gmQuizzdle.connect(player2).gm();
      expect(await gmQuizzdle.totalGmsGlobal()).to.equal(2);
    });
  });

  describe("Streak Mechanics", function () {
    it("Should start with streak of 1 for first GM", async function () {
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(1);
    });

    it("Should increment streak on consecutive days", async function () {
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(1);

      // Advance 1 day
      await time.increase(ONE_DAY);

      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(2);

      // Advance 1 day
      await time.increase(ONE_DAY);

      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(3);
    });

    it("Should reset streak if a day is missed", async function () {
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(1);

      // Advance 2 days (skip 1 day)
      await time.increase(ONE_DAY * 2);

      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(1);
    });

    it("Should emit StreakBroken event when streak is reset", async function () {
      await gmQuizzdle.connect(player1).gm();

      // Build a streak
      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();

      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(3);

      // Skip 2 days
      await time.increase(ONE_DAY * 2);

      await expect(gmQuizzdle.connect(player1).gm())
        .to.emit(gmQuizzdle, "StreakBroken")
        .withArgs(player1.address, 3);
    });

    it("Should not emit StreakBroken for first GM after long absence", async function () {
      // First GM ever after some time
      await time.increase(ONE_DAY * 10);
      const tx = await gmQuizzdle.connect(player1).gm();
      const receipt = await tx.wait();

      // Check no StreakBroken event
      const streakBrokenEvents = receipt?.logs.filter(
        (log) => {
          try {
            return gmQuizzdle.interface.parseLog(log as any)?.name === "StreakBroken";
          } catch {
            return false;
          }
        }
      );
      expect(streakBrokenEvents?.length).to.equal(0);
    });
  });

  describe("Longest Streak", function () {
    it("Should update longest streak when current exceeds it", async function () {
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(1);

      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(2);
    });

    it("Should emit NewLongestStreak event", async function () {
      await gmQuizzdle.connect(player1).gm();

      await time.increase(ONE_DAY);

      await expect(gmQuizzdle.connect(player1).gm())
        .to.emit(gmQuizzdle, "NewLongestStreak")
        .withArgs(player1.address, 2);
    });

    it("Should preserve longest streak after streak is broken", async function () {
      // Build a 5 day streak
      await gmQuizzdle.connect(player1).gm();
      for (let i = 0; i < 4; i++) {
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
      }
      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(5);

      // Skip 2 days
      await time.increase(ONE_DAY * 2);

      // Start new streak
      await gmQuizzdle.connect(player1).gm();

      // Longest streak should still be 5
      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(5);
      // Current streak should be 1
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(1);
    });

    it("Should update longest streak when new streak exceeds old", async function () {
      // Build a 3 day streak
      await gmQuizzdle.connect(player1).gm();
      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(3);

      // Skip and start new
      await time.increase(ONE_DAY * 2);
      await gmQuizzdle.connect(player1).gm();

      // Build a 5 day streak
      for (let i = 0; i < 4; i++) {
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
      }

      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(5);
    });
  });

  describe("View Functions", function () {
    describe("canGmToday", function () {
      it("Should return true if player hasn't said GM today", async function () {
        expect(await gmQuizzdle.canGmToday(player1.address)).to.be.true;
      });

      it("Should return false if player has said GM today", async function () {
        await gmQuizzdle.connect(player1).gm();
        expect(await gmQuizzdle.canGmToday(player1.address)).to.be.false;
      });

      it("Should return true again the next day", async function () {
        await gmQuizzdle.connect(player1).gm();
        expect(await gmQuizzdle.canGmToday(player1.address)).to.be.false;

        await time.increase(ONE_DAY);
        expect(await gmQuizzdle.canGmToday(player1.address)).to.be.true;
      });
    });

    describe("isStreakActive", function () {
      it("Should return false for new player", async function () {
        expect(await gmQuizzdle.isStreakActive(player1.address)).to.be.false;
      });

      it("Should return true if player said GM today", async function () {
        await gmQuizzdle.connect(player1).gm();
        expect(await gmQuizzdle.isStreakActive(player1.address)).to.be.true;
      });

      it("Should return true if player said GM yesterday", async function () {
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        expect(await gmQuizzdle.isStreakActive(player1.address)).to.be.true;
      });

      it("Should return false if player missed more than one day", async function () {
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY * 2);
        expect(await gmQuizzdle.isStreakActive(player1.address)).to.be.false;
      });
    });

    describe("getEffectiveStreak", function () {
      it("Should return 0 for new player", async function () {
        expect(await gmQuizzdle.getEffectiveStreak(player1.address)).to.equal(0);
      });

      it("Should return current streak if active", async function () {
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();

        expect(await gmQuizzdle.getEffectiveStreak(player1.address)).to.equal(3);
      });

      it("Should return 0 if streak is broken", async function () {
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();

        expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(2);

        await time.increase(ONE_DAY * 2);
        expect(await gmQuizzdle.getEffectiveStreak(player1.address)).to.equal(0);
      });
    });

    describe("getPlayerStats", function () {
      it("Should return all stats correctly", async function () {
        // Build a streak
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();

        const stats = await gmQuizzdle.getPlayerStats(player1.address);

        expect(stats.streak).to.equal(3);
        expect(stats.longest).to.equal(3);
        expect(stats.total).to.equal(3);
        expect(stats.canGm).to.be.false;
        expect(stats.streakActive).to.be.true;
      });

      it("Should show effective streak as 0 when broken", async function () {
        await gmQuizzdle.connect(player1).gm();
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();

        await time.increase(ONE_DAY * 2);

        const stats = await gmQuizzdle.getPlayerStats(player1.address);

        expect(stats.streak).to.equal(0); // Effective streak is 0
        expect(stats.longest).to.equal(2); // But longest is preserved
        expect(stats.total).to.equal(2);
        expect(stats.canGm).to.be.true;
        expect(stats.streakActive).to.be.false;
      });
    });

    describe("getGlobalStats", function () {
      it("Should return correct global stats", async function () {
        await gmQuizzdle.connect(player1).gm();
        await gmQuizzdle.connect(player2).gm();
        await gmQuizzdle.connect(player3).gm();

        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
        await gmQuizzdle.connect(player2).gm();

        const stats = await gmQuizzdle.getGlobalStats();
        expect(stats.totalGms_).to.equal(5);
        expect(stats.uniquePlayers_).to.equal(3);
      });
    });

    describe("getPlayersCount", function () {
      it("Should return correct player count", async function () {
        expect(await gmQuizzdle.getPlayersCount()).to.equal(0);

        await gmQuizzdle.connect(player1).gm();
        expect(await gmQuizzdle.getPlayersCount()).to.equal(1);

        await gmQuizzdle.connect(player2).gm();
        expect(await gmQuizzdle.getPlayersCount()).to.equal(2);

        // Same player next day shouldn't add to count
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
        expect(await gmQuizzdle.getPlayersCount()).to.equal(2);
      });
    });
  });

  describe("getAllPlayersLongestStreaks (Owner Only)", function () {
    beforeEach(async function () {
      // Build different streaks for different players
      await gmQuizzdle.connect(player1).gm();
      await gmQuizzdle.connect(player2).gm();

      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
      await gmQuizzdle.connect(player2).gm();

      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
      // player2 misses this day

      await time.increase(ONE_DAY);
      await gmQuizzdle.connect(player1).gm();
    });

    it("Should return all players with their longest streaks", async function () {
      const result = await gmQuizzdle.getAllPlayersLongestStreaks();

      expect(result.playerAddresses.length).to.equal(2);
      expect(result.longestStreaks.length).to.equal(2);

      expect(result.playerAddresses[0]).to.equal(player1.address);
      expect(result.playerAddresses[1]).to.equal(player2.address);

      expect(result.longestStreaks[0]).to.equal(4); // player1 has 4 day streak
      expect(result.longestStreaks[1]).to.equal(2); // player2 has 2 day streak
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        gmQuizzdle.connect(player1).getAllPlayersLongestStreaks()
      ).to.be.revertedWith("Only owner can call this function");
    });

    it("Should return empty arrays if no players", async function () {
      const GmQuizzdleFactory = await ethers.getContractFactory("GmQuizzdle");
      const newContract = await GmQuizzdleFactory.deploy();
      await newContract.waitForDeployment();

      const result = await newContract.getAllPlayersLongestStreaks();
      expect(result.playerAddresses.length).to.equal(0);
      expect(result.longestStreaks.length).to.equal(0);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle exactly midnight transitions", async function () {
      await gmQuizzdle.connect(player1).gm();

      // Get current block timestamp after first GM
      const block1 = await ethers.provider.getBlock("latest");
      const day1 = Math.floor(block1!.timestamp / ONE_DAY);

      // Advance to exactly next midnight using increaseTo
      const nextMidnight = (day1 + 1) * ONE_DAY;
      await time.increaseTo(nextMidnight);

      // Should now be able to GM (new day)
      await gmQuizzdle.connect(player1).gm();
      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(2);

      // Should not be able to GM again same day
      await expect(gmQuizzdle.connect(player1).gm()).to.be.revertedWith(
        "Already said GM today"
      );
    });

    it("Should handle very long streaks", async function () {
      // Build a 30 day streak
      await gmQuizzdle.connect(player1).gm();
      for (let i = 0; i < 29; i++) {
        await time.increase(ONE_DAY);
        await gmQuizzdle.connect(player1).gm();
      }

      expect(await gmQuizzdle.currentStreak(player1.address)).to.equal(30);
      expect(await gmQuizzdle.longestStreak(player1.address)).to.equal(30);
      expect(await gmQuizzdle.totalGms(player1.address)).to.equal(30);
    });

    it("Should handle many players correctly", async function () {
      const signers = await ethers.getSigners();
      const manyPlayers = signers.slice(0, 10);

      for (const player of manyPlayers) {
        await gmQuizzdle.connect(player).gm();
      }

      expect(await gmQuizzdle.uniquePlayers()).to.equal(10);
      expect(await gmQuizzdle.totalGmsGlobal()).to.equal(10);
      expect(await gmQuizzdle.getPlayersCount()).to.equal(10);
    });

    it("Should correctly track lastGmDay", async function () {
      await gmQuizzdle.connect(player1).gm();
      const currentBlock = await ethers.provider.getBlock("latest");
      const expectedDay = Math.floor(currentBlock!.timestamp / ONE_DAY);

      expect(await gmQuizzdle.lastGmDay(player1.address)).to.equal(expectedDay);
    });
  });
});
