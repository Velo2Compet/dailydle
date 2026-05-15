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

  // Just produces a unique-enough bytes32 — the contract treats it as opaque.
  function makeSaltedGuess(characterId: number, sessionSig: string, salt: string): string {
    return ethers.keccak256(
      ethers.solidityPacked(
        ["uint256", "string", "string"],
        [characterId, sessionSig, salt]
      )
    );
  }

  // Server-side COMMIT attestation. Must match Quizzdle.sol's hash exactly:
  //   keccak256("COMMIT", address(this), player, collectionId, day, saltedGuess, shouldFlag)
  async function signCommitAttestation(
    signer: any,
    contractAddress: string,
    playerAddress: string,
    collectionId: number,
    day: bigint,
    saltedGuess: string,
    shouldFlag: boolean
  ): Promise<string> {
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["string", "address", "address", "uint256", "uint256", "bytes32", "bool"],
        ["COMMIT", contractAddress, playerAddress, collectionId, day, saltedGuess, shouldFlag]
      )
    );
    return signer.signMessage(ethers.getBytes(messageHash));
  }

  // Server-side WIN attestation. Must match Quizzdle.sol's hash exactly:
  //   keccak256("WIN", address(this), winner, collectionId, day, saltedGuess)
  async function signWinAttestation(
    signer: any,
    contractAddress: string,
    winnerAddress: string,
    collectionId: number,
    day: bigint,
    saltedGuess: string
  ): Promise<string> {
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ["string", "address", "address", "uint256", "uint256", "bytes32"],
        ["WIN", contractAddress, winnerAddress, collectionId, day, saltedGuess]
      )
    );
    return signer.signMessage(ethers.getBytes(messageHash));
  }

  // Phase 1: paid commit. Records the salted hash on-chain and pays fee.
  async function commit(
    player: any,
    {
      collectionId = COLLECTION_ID,
      saltedGuess,
      shouldFlag = false,
      value = FEE,
      signer = null as any,
    }: {
      collectionId?: number;
      saltedGuess: string;
      shouldFlag?: boolean;
      value?: bigint;
      signer?: any;
    }
  ) {
    const day = await getCurrentDay();
    const useSigner = signer ?? server;
    const sig = await signCommitAttestation(
      useSigner,
      await quizzdle.getAddress(),
      player.address,
      collectionId,
      day,
      saltedGuess,
      shouldFlag
    );
    return quizzdle
      .connect(player)
      .submitSaltedGuess(collectionId, saltedGuess, shouldFlag, sig, { value });
  }

  // Phase 2: claim the win. Gas-only, no fee.
  // Anyone can submit the tx (relayer-friendly); the win is credited to `winner`.
  async function claim(
    submitter: any,
    {
      winner,
      collectionId = COLLECTION_ID,
      day,
      saltedGuess,
      signer = null as any,
    }: {
      winner: string;
      collectionId?: number;
      day: bigint;
      saltedGuess: string;
      signer?: any;
    }
  ) {
    const useSigner = signer ?? server;
    const sig = await signWinAttestation(
      useSigner,
      await quizzdle.getAddress(),
      winner,
      collectionId,
      day,
      saltedGuess
    );
    return quizzdle
      .connect(submitter)
      .claimWin(winner, collectionId, day, saltedGuess, sig);
  }

  // Convenience: full commit + claim for tests that just need a recorded win.
  async function commitAndClaim(
    player: any,
    {
      collectionId = COLLECTION_ID,
      saltedGuess,
      shouldFlag = false,
      value = FEE,
    }: {
      collectionId?: number;
      saltedGuess: string;
      shouldFlag?: boolean;
      value?: bigint;
    }
  ) {
    const day = await getCurrentDay();
    await commit(player, { collectionId, saltedGuess, shouldFlag, value });
    await claim(player, { winner: player.address, collectionId, day, saltedGuess });
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

  describe("submitSaltedGuess (commit phase)", function () {
    const SALT = "test_salt_decrypt";
    const SESSION_SIG = "session_signature_123";
    const CHAR_ID = 42;

    it("Should accept a valid commit and emit SaltedGuessMade ONLY", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const tx = await commit(player1, { saltedGuess });

      await expect(tx).to.emit(quizzdle, "SaltedGuessMade");
      // Critical: commit must NOT emit WinRecorded / WinClaimed.
      await expect(tx).to.not.emit(quizzdle, "WinRecorded");
      await expect(tx).to.not.emit(quizzdle, "WinClaimed");

      // hasWonToday remains false until claimWin is called.
      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.false;
      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(1);
    });

    it("Should reject invalid server signature (wrong key)", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);

      await expect(
        commit(player1, { saltedGuess, signer: player1 })
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject if a WIN signature is replayed as a COMMIT", async function () {
      // Defense in depth: domain separator "COMMIT" vs "WIN" prevents
      // cross-use of signatures even if both are signed by the server.
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();

      // Server signs a WIN attestation
      const winSig = await signWinAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess
      );

      // Player tries to submit it as a commit signature
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          false,
          winSig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject signature replay across contracts (address bound)", async function () {
      const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
      const other = await QuizzdleFactory.deploy();
      await other.waitForDeployment();
      await other.setServer(server.address);
      await other.addCollection(COLLECTION_ID);

      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      // Sign for the OTHER contract address
      const sig = await signCommitAttestation(
        server,
        await other.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        false
      );

      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          false,
          sig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject mismatched shouldFlag (signature bound)", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      // Server signs shouldFlag=false
      const sig = await signCommitAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        false
      );
      // User tries to submit with shouldFlag=true
      await expect(
        quizzdle.connect(player1).submitSaltedGuess(
          COLLECTION_ID,
          saltedGuess,
          true,
          sig,
          { value: FEE }
        )
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject insufficient fee", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await expect(
        commit(player1, { saltedGuess, value: 0n })
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should reject non-existent collection", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await expect(
        commit(player1, { saltedGuess, collectionId: 999 })
      ).to.be.revertedWith("Collection does not exist");
    });

    it("Should reject committing after the player has already claimed a win today", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess });

      // After claim, hasWonToday=true → further commits blocked.
      const other = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await expect(
        commit(player1, { saltedGuess: other })
      ).to.be.revertedWith("Already won today");
    });

    it("Should allow multiple commits before claim", async function () {
      // Player can keep guessing freely until they claim a win.
      for (let i = 0; i < 4; i++) {
        const sg = makeSaltedGuess(CHAR_ID + i, SESSION_SIG, SALT);
        await commit(player1, { saltedGuess: sg });
      }
      expect(await quizzdle.getAttemptsToday(player1.address, COLLECTION_ID)).to.equal(4);
      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.false;
    });
  });

  describe("claimWin (claim phase)", function () {
    const SALT = "test_salt_decrypt";
    const SESSION_SIG = "session_signature_123";
    const CHAR_ID = 42;

    it("Should claim a win after a matching commit", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });

      const day = await getCurrentDay();
      const tx = await claim(player1, {
        winner: player1.address,
        day,
        saltedGuess,
      });

      await expect(tx).to.emit(quizzdle, "WinRecorded")
        .withArgs(player1.address, COLLECTION_ID, day);
      await expect(tx).to.emit(quizzdle, "WinClaimed")
        .withArgs(player1.address, COLLECTION_ID, day, saltedGuess);

      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.true;

      // The matching commit row should be marked correct on-chain.
      const guesses = await quizzdle.getPlayerDailyGuesses(player1.address, COLLECTION_ID, day);
      expect(guesses.length).to.equal(1);
      expect(guesses[0].isCorrect).to.be.true;
    });

    it("Should reject claim if NO matching commit exists on-chain", async function () {
      // The "no free win" guarantee: even with a valid server WIN signature,
      // a claim cannot succeed unless the winner actually paid for a commit.
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();

      await expect(
        claim(player1, { winner: player1.address, day, saltedGuess })
      ).to.be.revertedWith("No matching commit on-chain");
    });

    it("Should reject claim with a non-server signature", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });

      const day = await getCurrentDay();
      await expect(
        claim(player1, {
          winner: player1.address,
          day,
          saltedGuess,
          signer: player1, // not the server
        })
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject if a COMMIT signature is replayed as a claim signature", async function () {
      // Domain separator "WIN" vs "COMMIT" must prevent reuse.
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });

      const day = await getCurrentDay();
      const commitSig = await signCommitAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess,
        false
      );

      await expect(
        quizzdle.connect(player1).claimWin(player1.address, COLLECTION_ID, day, saltedGuess, commitSig)
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject winner substitution (sig signed for A, submitted for B)", async function () {
      // The winner is part of the WIN signature preimage. Swapping the
      // _winner argument must invalidate the signature.
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });

      const day = await getCurrentDay();
      // Server signs WIN for player1
      const sig = await signWinAttestation(
        server,
        await quizzdle.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess
      );

      // Attacker tries to claim it for player2
      await expect(
        quizzdle.connect(player2).claimWin(player2.address, COLLECTION_ID, day, saltedGuess, sig)
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject claim signature replay across contracts", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });

      const QuizzdleFactory = await ethers.getContractFactory("Quizzdle");
      const other = await QuizzdleFactory.deploy();
      await other.waitForDeployment();

      const day = await getCurrentDay();
      // Signed against the OTHER contract address
      const sig = await signWinAttestation(
        server,
        await other.getAddress(),
        player1.address,
        COLLECTION_ID,
        day,
        saltedGuess
      );

      await expect(
        quizzdle.connect(player1).claimWin(player1.address, COLLECTION_ID, day, saltedGuess, sig)
      ).to.be.revertedWith("Invalid server signature");
    });

    it("Should reject double-claim (Already won today)", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess });

      const day = await getCurrentDay();
      await expect(
        claim(player1, { winner: player1.address, day, saltedGuess })
      ).to.be.revertedWith("Already won today");
    });

    it("Should reject claim on an already-finalized day", async function () {
      // Commit + (no claim) on day D
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });
      const day = await getCurrentDay();

      // Skip 2 days, then explicitly finalize day
      await ethers.provider.send("evm_increaseTime", [86400 * 2]);
      await ethers.provider.send("evm_mine", []);
      await quizzdle.finalizeDay(day);

      await expect(
        claim(player1, { winner: player1.address, day, saltedGuess })
      ).to.be.revertedWith("Day already finalized");
    });

    it("Should allow a relayer (not the winner) to submit the claim tx", async function () {
      // The win is credited to `_winner` regardless of msg.sender. This is
      // what enables a server-side relayer to save the player one popup.
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess });

      const day = await getCurrentDay();
      // player2 acts as the relayer
      await claim(player2, {
        winner: player1.address,
        day,
        saltedGuess,
      });

      expect(await quizzdle.hasWonToday(player1.address, COLLECTION_ID)).to.be.true;
      expect(await quizzdle.hasWonToday(player2.address, COLLECTION_ID)).to.be.false;
      expect(await quizzdle.totalWins(player1.address)).to.equal(1);
      expect(await quizzdle.totalWins(player2.address)).to.equal(0);
    });

    it("Should reject claim for the zero address", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      await expect(
        claim(player1, { winner: ethers.ZeroAddress, day, saltedGuess })
      ).to.be.revertedWith("Invalid winner");
    });

    it("Should reject claim on non-existent collection", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const day = await getCurrentDay();
      await expect(
        claim(player1, {
          winner: player1.address,
          collectionId: 999,
          day,
          saltedGuess,
        })
      ).to.be.revertedWith("Collection does not exist");
    });
  });

  describe("Auto-Flag Mechanism (shouldFlag)", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should auto-flag wallet when shouldFlag is true (at commit time)", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const tx = await commit(player1, { saltedGuess, shouldFlag: true });

      await expect(tx).to.emit(quizzdle, "WalletFlagged")
        .withArgs(player1.address, "Multi-wallet detected");

      expect(await quizzdle.flaggedWallets(player1.address)).to.be.true;
      expect(await quizzdle.flagReason(player1.address)).to.equal("Multi-wallet detected");
    });

    it("Should not flag wallet when shouldFlag is false", async function () {
      const saltedGuess = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess, shouldFlag: false });
      expect(await quizzdle.flaggedWallets(player1.address)).to.be.false;
    });

    it("Should not double-flag an already flagged wallet", async function () {
      const first = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess: first, shouldFlag: true });
      const flaggedBefore = await quizzdle.totalFlaggedWallets();

      const second = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess: second, shouldFlag: true });
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

    it("Should block flagged wallet from claiming winner rewards", async function () {
      // player1 wins on day D and is flagged at commit time.
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1, shouldFlag: true });

      // Roll over to day D+1 and have player2 commit to auto-finalize day D.
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg2 });

      const dayD = (await getCurrentDay()) - 1n;
      await expect(
        quizzdle.connect(player1).claimWinnerRewards(dayD)
      ).to.be.revertedWith("Wallet flagged for abuse");
    });

    it("Should allow clean wallet to claim winner rewards", async function () {
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1 });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg2 });

      const dayD = (await getCurrentDay()) - 1n;
      await quizzdle.connect(player1).claimWinnerRewards(dayD);
    });

    it("Should block flagged wallet from claiming referral rewards", async function () {
      await referral.connect(player1).setReferralCode("PLAYER1");
      await referral.connect(player2).registerWithReferral("PLAYER1");

      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg });
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
      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg, value: largerFee });

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

    it("Should return correct user session data after a claim", async function () {
      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg });

      const day = await getCurrentDay();
      const session = await quizzdle.getUserSession(player1.address, COLLECTION_ID, day);
      expect(session.hasWonToday).to.be.true;
      expect(session.attemptsToday).to.equal(1);
    });

    it("Should return player daily guesses (all isCorrect=false before claim)", async function () {
      for (let i = 0; i < 2; i++) {
        const sg = makeSaltedGuess(i + 1, SESSION_SIG, SALT);
        await commit(player1, { saltedGuess: sg });
      }
      const day = await getCurrentDay();
      const guesses = await quizzdle.getPlayerDailyGuesses(player1.address, COLLECTION_ID, day);
      expect(guesses.length).to.equal(2);
      expect(guesses[0].isCorrect).to.be.false;
      expect(guesses[1].isCorrect).to.be.false;
    });

    it("Should mark matching commit isCorrect=true after claim", async function () {
      const wrong = makeSaltedGuess(1, SESSION_SIG, SALT);
      const right = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commit(player1, { saltedGuess: wrong });
      await commit(player1, { saltedGuess: right });

      const day = await getCurrentDay();
      await claim(player1, { winner: player1.address, day, saltedGuess: right });

      const guesses = await quizzdle.getPlayerDailyGuesses(player1.address, COLLECTION_ID, day);
      expect(guesses.length).to.equal(2);
      expect(guesses[0].isCorrect).to.be.false;
      expect(guesses[1].isCorrect).to.be.true;
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

    it("Should credit referral rewards at commit time (10%)", async function () {
      await referral.connect(player1).setReferralCode("PLAYER1CODE");
      await referral.connect(player2).registerWithReferral("PLAYER1CODE");

      const largerFee = ethers.parseEther("0.01");
      await quizzdle.setFee(largerFee);

      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      // Referral is credited even on a losing commit — it's 10% of the fee.
      await commit(player2, { saltedGuess: sg, value: largerFee });

      const expectedReferral = largerFee / 10n;
      expect(await quizzdle.referralRewards(player1.address)).to.equal(expectedReferral);
    });
  });

  describe("Stats Tracking", function () {
    const SALT = "test_salt";
    const SESSION_SIG = "session_123";
    const CHAR_ID = 42;

    it("Should track global stats correctly across two winners", async function () {
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1 });
      await commitAndClaim(player2, { saltedGuess: sg2 });

      const day = await getCurrentDay();
      expect(await quizzdle.globalTotalWins()).to.equal(2);
      expect(await quizzdle.globalTotalPaid()).to.equal(FEE * 2n);
      expect(await quizzdle.totalWinsPerDay(day)).to.equal(2);
    });

    it("Should track per-player stats correctly (paid increments per commit, wins per claim)", async function () {
      for (let i = 0; i < 3; i++) {
        const sg = makeSaltedGuess(i + 1, SESSION_SIG, SALT);
        await commit(player1, { saltedGuess: sg });
      }
      const correct = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: correct });

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
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      const today = await getCurrentDay();
      await commitAndClaim(player1, { saltedGuess: sg1 });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      // A new commit on the next day auto-finalizes today
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commit(player2, { saltedGuess: sg2 });

      await expect(
        quizzdle.connect(owner).addDailyBonus(today, { value: BONUS_AMOUNT })
      ).to.be.revertedWith("Day already finalized");
    });

    it("Should combine bonus with player fees in reward pool", async function () {
      const today = await getCurrentDay();
      await quizzdle.connect(owner).addDailyBonus(today, { value: BONUS_AMOUNT });

      const largerFee = ethers.parseEther("0.005");
      await quizzdle.setFee(largerFee);

      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg, value: largerFee });

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

    it("Should allow anyone to finalize a past day so winners can claim rewards", async function () {
      const day1 = await getCurrentDay();
      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg });

      // Skip 2 days without anyone playing — day1 would stay unfinalized.
      await ethers.provider.send("evm_increaseTime", [86400 * 2]);
      await ethers.provider.send("evm_mine", []);

      await quizzdle.connect(player3).finalizeDay(day1);
      expect(await quizzdle.dayFinalized(day1)).to.be.true;

      await quizzdle.connect(player1).claimWinnerRewards(day1);
    });

    it("Should be idempotent (rejects double finalization)", async function () {
      const day1 = await getCurrentDay();
      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg });

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

    beforeEach(async function () {
      await quizzdle.setFee(LARGER_FEE);
    });

    it("Should return correct total pending rewards", async function () {
      const day1 = await getCurrentDay();
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1, value: LARGER_FEE });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg2, value: LARGER_FEE });

      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(unclaimedDays).to.equal(1);
      expect(totalPending).to.be.greaterThan(0);
      expect(totalPending).to.equal(await quizzdle.getPendingWinnerRewards(player1.address, day1));
    });

    it("Should claim all rewards from multiple days in one transaction", async function () {
      const day1 = await getCurrentDay();
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1, value: LARGER_FEE });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const day2 = await getCurrentDay();
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg2, value: LARGER_FEE });

      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg3 = makeSaltedGuess(CHAR_ID + 2, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg3, value: LARGER_FEE });

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
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1, value: LARGER_FEE });
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg2, value: LARGER_FEE });

      await quizzdle.flagWallet(player1.address, "Test flag");
      await expect(
        quizzdle.connect(player1).claimAllWinnerRewards(30)
      ).to.be.revertedWith("Wallet flagged for abuse");
    });

    it("Should respect maxDaysToCheck parameter", async function () {
      const sg1 = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg1, value: LARGER_FEE });
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg2 = makeSaltedGuess(CHAR_ID + 1, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg2, value: LARGER_FEE });
      await ethers.provider.send("evm_increaseTime", [86400]);
      await ethers.provider.send("evm_mine", []);
      const sg3 = makeSaltedGuess(CHAR_ID + 2, SESSION_SIG, SALT);
      await commitAndClaim(player2, { saltedGuess: sg3, value: LARGER_FEE });

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
      const sg = makeSaltedGuess(CHAR_ID, SESSION_SIG, SALT);
      await commitAndClaim(player1, { saltedGuess: sg, value: LARGER_FEE });
      // Day not finalized yet → no pending rewards.
      const [totalPending, unclaimedDays] = await quizzdle.getTotalPendingRewards(player1.address, 30);
      expect(totalPending).to.equal(0);
      expect(unclaimedDays).to.equal(0);
    });
  });
});
