import { formatEther, formatGwei } from "viem";

/**
 * Short, mobile-friendly ETH formatter for narrow grid cells.
 *
 * Rules tuned to fit ~7 chars in a 100px-wide bold cell:
 *   0                       → "0"
 *   < 0.0001                → "<0.0001"
 *   < 1                     → up to 4 sig digits, trailing zeros trimmed
 *   < 1000                  → up to 3 decimals, trailing zeros trimmed
 *   < 1e6                   → "1.2k"
 *   else                    → "1.2M"
 *
 * For exact values (claim button labels, inputs, tooltips) keep using
 * `formatEther` directly — this helper is intentionally lossy.
 */
export function formatEthShort(wei: bigint): string {
  if (wei === BigInt(0)) return "0";

  const num = Number(formatEther(wei));
  if (!Number.isFinite(num) || num === 0) return "0";

  if (num < 0.0001) return "<0.0001";

  if (num < 1) {
    return stripTrailingZeros(num.toPrecision(4));
  }
  if (num < 1000) {
    return stripTrailingZeros(num.toFixed(3));
  }
  if (num < 1_000_000) {
    return stripTrailingZeros((num / 1000).toFixed(1)) + "k";
  }
  return stripTrailingZeros((num / 1_000_000).toFixed(1)) + "M";
}

/**
 * Short gwei formatter for the fee display. Gwei values for sane fees
 * (~100 gwei = 0.0001 ETH) are 1–6 digits, but for very small or very
 * large fees we still want to avoid overflow.
 */
export function formatGweiShort(wei: bigint): string {
  if (wei === BigInt(0)) return "0";
  const num = Number(formatGwei(wei));
  if (!Number.isFinite(num) || num === 0) return "0";
  if (num < 0.01) return "<0.01";
  if (num < 1000) return stripTrailingZeros(num.toFixed(2));
  if (num < 1_000_000) return stripTrailingZeros((num / 1000).toFixed(1)) + "k";
  return stripTrailingZeros((num / 1_000_000).toFixed(1)) + "M";
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
}
