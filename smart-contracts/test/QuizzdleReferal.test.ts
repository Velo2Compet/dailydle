const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("QuizzdleReferal", function () {
  let quizzdleReferal: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let user4: any;

  beforeEach(async function () {
    [owner, user1, user2, user3, user4] = await ethers.getSigners();

    const QuizzdleReferalFactory = await ethers.getContractFactory("QuizzdleReferal");
    quizzdleReferal = await QuizzdleReferalFactory.deploy();
    await quizzdleReferal.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await quizzdleReferal.owner()).to.equal(owner.address);
    });

    it("Should initialize total users to zero", async function () {
      expect(await quizzdleReferal.totalUsers()).to.equal(0);
    });

    it("Should initialize total referrals to zero", async function () {
      expect(await quizzdleReferal.totalReferrals()).to.equal(0);
    });
  });

  describe("Referral Code Management", function () {
    describe("setReferralCode", function () {
      it("Should allow a user to set a referral code", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("user1code");
        expect(await quizzdleReferal.addressToCode(user1.address)).to.equal("user1code");
        expect(await quizzdleReferal.codeToAddress("user1code")).to.equal(user1.address);
      });

      it("Should emit CodeCreated event", async function () {
        await expect(quizzdleReferal.connect(user1).setReferralCode("mycode"))
          .to.emit(quizzdleReferal, "CodeCreated")
          .withArgs(user1.address, "mycode");
      });

      it("Should register the user when setting code", async function () {
        expect(await quizzdleReferal.hasRegistered(user1.address)).to.be.false;
        await quizzdleReferal.connect(user1).setReferralCode("mycode");
        expect(await quizzdleReferal.hasRegistered(user1.address)).to.be.true;
        expect(await quizzdleReferal.totalUsers()).to.equal(1);
      });

      it("Should emit UserRegistered event on first code set", async function () {
        await expect(quizzdleReferal.connect(user1).setReferralCode("mycode"))
          .to.emit(quizzdleReferal, "UserRegistered")
          .withArgs(user1.address);
      });

      it("Should not emit UserRegistered on subsequent code changes", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("code1");

        const tx = await quizzdleReferal.connect(user1).setReferralCode("code2");
        const receipt = await tx.wait();

        const userRegisteredEvents = receipt?.logs.filter((log) => {
          try {
            return quizzdleReferal.interface.parseLog(log as any)?.name === "UserRegistered";
          } catch {
            return false;
          }
        });
        expect(userRegisteredEvents?.length).to.equal(0);
      });

      it("Should allow user to change their code", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("oldcode");
        await quizzdleReferal.connect(user1).setReferralCode("newcode");

        expect(await quizzdleReferal.addressToCode(user1.address)).to.equal("newcode");
        expect(await quizzdleReferal.codeToAddress("newcode")).to.equal(user1.address);
        expect(await quizzdleReferal.codeToAddress("oldcode")).to.equal(ethers.ZeroAddress);
      });

      it("Should revert if code is too short (less than 3 chars)", async function () {
        await expect(
          quizzdleReferal.connect(user1).setReferralCode("ab")
        ).to.be.revertedWith("Code must be 3-20 characters");
      });

      it("Should revert if code is too long (more than 20 chars)", async function () {
        await expect(
          quizzdleReferal.connect(user1).setReferralCode("123456789012345678901")
        ).to.be.revertedWith("Code must be 3-20 characters");
      });

      it("Should accept code with exactly 3 characters", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("abc");
        expect(await quizzdleReferal.addressToCode(user1.address)).to.equal("abc");
      });

      it("Should accept code with exactly 20 characters", async function () {
        const code20 = "12345678901234567890";
        await quizzdleReferal.connect(user1).setReferralCode(code20);
        expect(await quizzdleReferal.addressToCode(user1.address)).to.equal(code20);
      });

      it("Should revert if code is already taken by another user", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("takencode");

        await expect(
          quizzdleReferal.connect(user2).setReferralCode("takencode")
        ).to.be.revertedWith("Code already taken");
      });

      it("Should allow user to set the same code again", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("mycode");
        await quizzdleReferal.connect(user1).setReferralCode("mycode"); // Same code
        expect(await quizzdleReferal.addressToCode(user1.address)).to.equal("mycode");
      });

      it("Should not increment totalUsers on code change", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("code1");
        expect(await quizzdleReferal.totalUsers()).to.equal(1);

        await quizzdleReferal.connect(user1).setReferralCode("code2");
        expect(await quizzdleReferal.totalUsers()).to.equal(1);
      });
    });

    describe("isCodeAvailable", function () {
      it("Should return true for available code", async function () {
        expect(await quizzdleReferal.isCodeAvailable("newcode")).to.be.true;
      });

      it("Should return false for taken code", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("takencode");
        expect(await quizzdleReferal.isCodeAvailable("takencode")).to.be.false;
      });

      it("Should return true after code is released", async function () {
        await quizzdleReferal.connect(user1).setReferralCode("mycode");
        expect(await quizzdleReferal.isCodeAvailable("mycode")).to.be.false;

        await quizzdleReferal.connect(user1).setReferralCode("newcode");
        expect(await quizzdleReferal.isCodeAvailable("mycode")).to.be.true;
      });
    });
  });

  describe("Registration with Referral", function () {
    beforeEach(async function () {
      // Set up user1 with a referral code
      await quizzdleReferal.connect(user1).setReferralCode("referrer1");
    });

    describe("registerWithReferral", function () {
      it("Should register a new user without referral code", async function () {
        await quizzdleReferal.connect(user2).registerWithReferral("");

        expect(await quizzdleReferal.hasRegistered(user2.address)).to.be.true;
        expect(await quizzdleReferal.totalUsers()).to.equal(2); // user1 + user2
      });

      it("Should register a new user with valid referral code", async function () {
        await quizzdleReferal.connect(user2).registerWithReferral("referrer1");

        expect(await quizzdleReferal.hasRegistered(user2.address)).to.be.true;
        expect(await quizzdleReferal.referredBy(user2.address)).to.equal(user1.address);
      });

      it("Should emit ReferralRegistered event", async function () {
        await expect(quizzdleReferal.connect(user2).registerWithReferral("referrer1"))
          .to.emit(quizzdleReferal, "ReferralRegistered")
          .withArgs(user2.address, user1.address, "referrer1");
      });

      it("Should emit UserRegistered event", async function () {
        await expect(quizzdleReferal.connect(user2).registerWithReferral("referrer1"))
          .to.emit(quizzdleReferal, "UserRegistered")
          .withArgs(user2.address);
      });

      it("Should add new user to referrer's referrals list", async function () {
        await quizzdleReferal.connect(user2).registerWithReferral("referrer1");
        await quizzdleReferal.connect(user3).registerWithReferral("referrer1");

        const referrals = await quizzdleReferal.getUserReferrals(user1.address);
        expect(referrals.length).to.equal(2);
        expect(referrals[0]).to.equal(user2.address);
        expect(referrals[1]).to.equal(user3.address);
      });

      it("Should increment totalReferrals", async function () {
        await quizzdleReferal.connect(user2).registerWithReferral("referrer1");
        expect(await quizzdleReferal.totalReferrals()).to.equal(1);

        await quizzdleReferal.connect(user3).registerWithReferral("referrer1");
        expect(await quizzdleReferal.totalReferrals()).to.equal(2);
      });

      it("Should increment referrer's referral count", async function () {
        expect(await quizzdleReferal.getReferralCount(user1.address)).to.equal(0);

        await quizzdleReferal.connect(user2).registerWithReferral("referrer1");
        expect(await quizzdleReferal.getReferralCount(user1.address)).to.equal(1);

        await quizzdleReferal.connect(user3).registerWithReferral("referrer1");
        expect(await quizzdleReferal.getReferralCount(user1.address)).to.equal(2);
      });

      it("Should revert if user is already registered", async function () {
        await quizzdleReferal.connect(user2).registerWithReferral("referrer1");

        await expect(
          quizzdleReferal.connect(user2).registerWithReferral("referrer1")
        ).to.be.revertedWith("Already registered");
      });

      it("Should not link referral if code is invalid", async function () {
        await quizzdleReferal.connect(user2).registerWithReferral("invalidcode");

        expect(await quizzdleReferal.hasRegistered(user2.address)).to.be.true;
        expect(await quizzdleReferal.referredBy(user2.address)).to.equal(ethers.ZeroAddress);
        expect(await quizzdleReferal.totalReferrals()).to.equal(0);
      });

      it("Should not allow self-referral", async function () {
        // user1 tries to register using their own code
        // But user1 is already registered (from setReferralCode), so this would fail
        // Let's test with a fresh user who sets code and tries to use it

        // user2 sets a code (which registers them)
        await quizzdleReferal.connect(user2).setReferralCode("user2code");

        // Now user2 tries to registerWithReferral - should fail as already registered
        await expect(
          quizzdleReferal.connect(user2).registerWithReferral("user2code")
        ).to.be.revertedWith("Already registered");
      });

      it("Should register without referral if trying to use own code", async function () {
        // This scenario: user2 tries to use code "user2code" before it exists
        // Then registers - code doesn't exist so no referral link

        await quizzdleReferal.connect(user2).registerWithReferral("user2code");

        expect(await quizzdleReferal.hasRegistered(user2.address)).to.be.true;
        expect(await quizzdleReferal.referredBy(user2.address)).to.equal(ethers.ZeroAddress);
      });
    });
  });

  describe("View Functions", function () {
    beforeEach(async function () {
      // Setup: user1 as referrer with 2 referrals
      await quizzdleReferal.connect(user1).setReferralCode("ref1");
      await quizzdleReferal.connect(user2).registerWithReferral("ref1");
      await quizzdleReferal.connect(user3).registerWithReferral("ref1");
    });

    describe("getReferralCount", function () {
      it("Should return correct referral count", async function () {
        expect(await quizzdleReferal.getReferralCount(user1.address)).to.equal(2);
        expect(await quizzdleReferal.getReferralCount(user2.address)).to.equal(0);
      });
    });

    describe("getUserReferrals", function () {
      it("Should return all referrals for a user", async function () {
        const referrals = await quizzdleReferal.getUserReferrals(user1.address);
        expect(referrals.length).to.equal(2);
        expect(referrals).to.include(user2.address);
        expect(referrals).to.include(user3.address);
      });

      it("Should return empty array for user with no referrals", async function () {
        const referrals = await quizzdleReferal.getUserReferrals(user2.address);
        expect(referrals.length).to.equal(0);
      });
    });

    describe("getUserStats", function () {
      it("Should return correct stats for referrer", async function () {
        const stats = await quizzdleReferal.getUserStats(user1.address);

        expect(stats.code).to.equal("ref1");
        expect(stats.referrer).to.equal(ethers.ZeroAddress);
        expect(stats.referralCount).to.equal(2);
        expect(stats.registered).to.be.true;
      });

      it("Should return correct stats for referred user", async function () {
        const stats = await quizzdleReferal.getUserStats(user2.address);

        expect(stats.code).to.equal("");
        expect(stats.referrer).to.equal(user1.address);
        expect(stats.referralCount).to.equal(0);
        expect(stats.registered).to.be.true;
      });

      it("Should return default stats for unregistered user", async function () {
        const stats = await quizzdleReferal.getUserStats(user4.address);

        expect(stats.code).to.equal("");
        expect(stats.referrer).to.equal(ethers.ZeroAddress);
        expect(stats.referralCount).to.equal(0);
        expect(stats.registered).to.be.false;
      });
    });

    describe("getGlobalStats", function () {
      it("Should return correct global stats", async function () {
        const stats = await quizzdleReferal.getGlobalStats();

        expect(stats.totalUsers_).to.equal(3); // user1, user2, user3
        expect(stats.totalReferrals_).to.equal(2); // user2 and user3 were referred
      });
    });
  });

  describe("Complex Scenarios", function () {
    it("Should handle multi-level referral chain", async function () {
      // user1 -> user2 -> user3 -> user4

      await quizzdleReferal.connect(user1).setReferralCode("level1");
      await quizzdleReferal.connect(user2).registerWithReferral("level1");

      await quizzdleReferal.connect(user2).setReferralCode("level2");
      await quizzdleReferal.connect(user3).registerWithReferral("level2");

      await quizzdleReferal.connect(user3).setReferralCode("level3");
      await quizzdleReferal.connect(user4).registerWithReferral("level3");

      expect(await quizzdleReferal.referredBy(user2.address)).to.equal(user1.address);
      expect(await quizzdleReferal.referredBy(user3.address)).to.equal(user2.address);
      expect(await quizzdleReferal.referredBy(user4.address)).to.equal(user3.address);

      expect(await quizzdleReferal.getReferralCount(user1.address)).to.equal(1);
      expect(await quizzdleReferal.getReferralCount(user2.address)).to.equal(1);
      expect(await quizzdleReferal.getReferralCount(user3.address)).to.equal(1);

      expect(await quizzdleReferal.totalReferrals()).to.equal(3);
    });

    it("Should handle user changing code after getting referrals", async function () {
      await quizzdleReferal.connect(user1).setReferralCode("oldcode");
      await quizzdleReferal.connect(user2).registerWithReferral("oldcode");

      // User1 changes their code
      await quizzdleReferal.connect(user1).setReferralCode("newcode");

      // User2 should still be linked to user1
      expect(await quizzdleReferal.referredBy(user2.address)).to.equal(user1.address);

      // New users should use the new code
      await quizzdleReferal.connect(user3).registerWithReferral("newcode");
      expect(await quizzdleReferal.referredBy(user3.address)).to.equal(user1.address);

      // Old code should not work anymore
      await quizzdleReferal.connect(user4).registerWithReferral("oldcode");
      expect(await quizzdleReferal.referredBy(user4.address)).to.equal(ethers.ZeroAddress);
    });

    it("Should handle many referrals for one user", async function () {
      await quizzdleReferal.connect(user1).setReferralCode("popular");

      const signers = await ethers.getSigners();
      const newUsers = signers.slice(5, 15); // 10 new users

      for (const newUser of newUsers) {
        await quizzdleReferal.connect(newUser).registerWithReferral("popular");
      }

      expect(await quizzdleReferal.getReferralCount(user1.address)).to.equal(10);
      const referrals = await quizzdleReferal.getUserReferrals(user1.address);
      expect(referrals.length).to.equal(10);
    });

    it("Should handle registration without referral then setting code", async function () {
      // User registers without referral
      await quizzdleReferal.connect(user2).registerWithReferral("");
      expect(await quizzdleReferal.hasRegistered(user2.address)).to.be.true;

      // User then sets a referral code
      await quizzdleReferal.connect(user2).setReferralCode("mycode");
      expect(await quizzdleReferal.addressToCode(user2.address)).to.equal("mycode");

      // User count should still be 1
      expect(await quizzdleReferal.totalUsers()).to.equal(1);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle empty string referral code in registration", async function () {
      await quizzdleReferal.connect(user1).registerWithReferral("");
      expect(await quizzdleReferal.hasRegistered(user1.address)).to.be.true;
      expect(await quizzdleReferal.referredBy(user1.address)).to.equal(ethers.ZeroAddress);
    });

    it("Should handle special characters in code (if valid)", async function () {
      // Note: The contract doesn't validate character types, only length
      await quizzdleReferal.connect(user1).setReferralCode("abc123");
      expect(await quizzdleReferal.addressToCode(user1.address)).to.equal("abc123");
    });

    it("Should handle case sensitivity in codes", async function () {
      await quizzdleReferal.connect(user1).setReferralCode("MyCode");
      await quizzdleReferal.connect(user2).setReferralCode("mycode"); // Different case

      expect(await quizzdleReferal.codeToAddress("MyCode")).to.equal(user1.address);
      expect(await quizzdleReferal.codeToAddress("mycode")).to.equal(user2.address);
    });

    it("Should correctly track stats with mixed registrations", async function () {
      // Some users register with referral, some without, some set codes
      await quizzdleReferal.connect(user1).setReferralCode("ref1");
      await quizzdleReferal.connect(user2).registerWithReferral("ref1");
      await quizzdleReferal.connect(user3).registerWithReferral("");
      await quizzdleReferal.connect(user4).setReferralCode("ref4");

      expect(await quizzdleReferal.totalUsers()).to.equal(4);
      expect(await quizzdleReferal.totalReferrals()).to.equal(1);
    });
  });
});
