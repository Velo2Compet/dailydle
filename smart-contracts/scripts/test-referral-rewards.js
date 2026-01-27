const { ethers } = require("hardhat");
require("dotenv").config({ path: ".env.local" });

/**
 * Script to create 2 referred users who each spend ~$1 in fees,
 * so the deployer can test claiming referral rewards on the profile page.
 *
 * Usage: npx hardhat run smart-contracts/scripts/test-referral-rewards.js --network base-sepolia
 */

async function main() {
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  const referalContractAddress = process.env.NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS;

  if (!contractAddress || !referalContractAddress) {
    console.error("Missing NEXT_PUBLIC_CONTRACT_ADDRESS or NEXT_PUBLIC_REFERAL_CONTRACT_ADDRESS in .env.local");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer (referrer):", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Attach contracts
  const Quizzdle = await ethers.getContractFactory("Quizzdle");
  const quizzdle = Quizzdle.attach(contractAddress);

  const QuizzdleReferal = await ethers.getContractFactory("QuizzdleReferal");
  const referal = QuizzdleReferal.attach(referalContractAddress);

  // Read current fee
  const currentFee = await quizzdle.feePerGuess();
  console.log("Current fee per guess:", ethers.formatEther(currentFee), "ETH");

  // --- Step 1: Deployer sets a referral code ---
  const refCode = "caca";
  console.log(`\n1. Setting referral code "${refCode}" for deployer...`);

  // Check if deployer already has a code
  const existingCode = await referal.addressToCode(deployer.address);
  if (existingCode && existingCode.length > 0) {
    console.log(`   Deployer already has code: "${existingCode}"`);
  } else {
    const tx = await referal.setReferralCode(refCode, {
      gasPrice: (await ethers.provider.getFeeData()).gasPrice,
    });
    await tx.wait();
    console.log(`   Referral code set (tx: ${tx.hash})`);
  }

  // Use the actual code (could be existing or new)
  const deployerCode = (await referal.addressToCode(deployer.address)) || refCode;
  console.log(`   Using code: "${deployerCode}"`);

  // --- Step 2: Create 2 temporary wallets and fund them ---
  console.log("\n2. Creating 2 temporary wallets...");

  // $1 ≈ 0.0003 ETH (at ~$3300). We set fee to 0.0003 ETH, make 1 guess each.
  // Fund each wallet with enough for: fee + gas (~0.001 ETH extra for gas)
  const feeForOneUsd = ethers.parseEther("0.0003"); // ~$1
  const gasBuffer = ethers.parseEther("0.002");
  const fundAmount = feeForOneUsd + gasBuffer;

  const wallet1 = ethers.Wallet.createRandom().connect(ethers.provider);
  const wallet2 = ethers.Wallet.createRandom().connect(ethers.provider);

  console.log("   Wallet 1:", wallet1.address);
  console.log("   Wallet 2:", wallet2.address);

  // Fund wallets
  console.log(`   Funding each wallet with ${ethers.formatEther(fundAmount)} ETH...`);

  const fund1 = await deployer.sendTransaction({
    to: wallet1.address,
    value: fundAmount,
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await fund1.wait();
  console.log(`   Wallet 1 funded (tx: ${fund1.hash})`);

  const fund2 = await deployer.sendTransaction({
    to: wallet2.address,
    value: fundAmount,
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await fund2.wait();
  console.log(`   Wallet 2 funded (tx: ${fund2.hash})`);

  // --- Step 3: Register wallets with referral code ---
  console.log("\n3. Registering wallets with referral code...");

  const referalW1 = referal.connect(wallet1);
  const reg1 = await referalW1.registerWithReferral(deployerCode, {
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await reg1.wait();
  console.log(`   Wallet 1 registered with code "${deployerCode}" (tx: ${reg1.hash})`);

  const referalW2 = referal.connect(wallet2);
  const reg2 = await referalW2.registerWithReferral(deployerCode, {
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await reg2.wait();
  console.log(`   Wallet 2 registered with code "${deployerCode}" (tx: ${reg2.hash})`);

  // Verify referrals
  const ref1 = await referal.referredBy(wallet1.address);
  const ref2 = await referal.referredBy(wallet2.address);
  console.log(`   Wallet 1 referred by: ${ref1}`);
  console.log(`   Wallet 2 referred by: ${ref2}`);

  // --- Step 4: Set fee to ~$1 and make guesses ---
  console.log("\n4. Temporarily setting fee to 0.0003 ETH (~$1)...");

  const setFeeTx = await quizzdle.setFee(feeForOneUsd, {
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await setFeeTx.wait();
  console.log(`   Fee set to ${ethers.formatEther(feeForOneUsd)} ETH (tx: ${setFeeTx.hash})`);

  // Get a valid collection ID (first one)
  // Try collection ID 1, check if it exists
  let collectionId = 1;
  const exists = await quizzdle.collectionExists(collectionId);
  if (!exists) {
    console.error("   Collection ID 1 does not exist. Trying to find a valid collection...");
    for (let i = 2; i <= 20; i++) {
      if (await quizzdle.collectionExists(i)) {
        collectionId = i;
        break;
      }
    }
  }
  console.log(`   Using collection ID: ${collectionId}`);

  // Get character IDs for guessing (we just need any valid character ID)
  const characterIds = await quizzdle.getCollectionCharacterIds(collectionId);
  const guessCharId = characterIds[0]; // Just pick the first one
  console.log(`   Guessing character ID: ${guessCharId}`);

  // Wallet 1 makes a guess
  console.log("\n5. Wallet 1 making a guess...");
  const quizzdleW1 = quizzdle.connect(wallet1);
  const guess1 = await quizzdleW1.makeGuess(collectionId, guessCharId, {
    value: feeForOneUsd,
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await guess1.wait();
  console.log(`   Wallet 1 guessed (tx: ${guess1.hash})`);

  // Wallet 2 makes a guess
  console.log("   Wallet 2 making a guess...");
  const quizzdleW2 = quizzdle.connect(wallet2);
  const guess2 = await quizzdleW2.makeGuess(collectionId, guessCharId, {
    value: feeForOneUsd,
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await guess2.wait();
  console.log(`   Wallet 2 guessed (tx: ${guess2.hash})`);

  // --- Step 5: Reset fee ---
  console.log("\n6. Resetting fee to original value...");
  const resetFeeTx = await quizzdle.setFee(currentFee, {
    gasPrice: (await ethers.provider.getFeeData()).gasPrice,
  });
  await resetFeeTx.wait();
  console.log(`   Fee reset to ${ethers.formatEther(currentFee)} ETH (tx: ${resetFeeTx.hash})`);

  // --- Step 6: Check pending rewards ---
  const pending = await quizzdle.pendingReferralRewards(deployer.address);
  const expectedPerGuess = feeForOneUsd / 10n;
  const expectedTotal = expectedPerGuess * 2n;

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`   Referrer: ${deployer.address}`);
  console.log(`   Referred users: 2`);
  console.log(`   Fee per guess: ${ethers.formatEther(feeForOneUsd)} ETH (~$1)`);
  console.log(`   10% per guess: ${ethers.formatEther(expectedPerGuess)} ETH`);
  console.log(`   Expected total: ${ethers.formatEther(expectedTotal)} ETH`);
  console.log(`   Pending rewards: ${ethers.formatEther(pending)} ETH`);
  console.log("=".repeat(60));
  console.log("\nYou can now claim your rewards on the profile page!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
