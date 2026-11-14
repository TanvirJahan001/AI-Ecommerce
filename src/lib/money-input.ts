/** BDT text at the UI boundary; database/API values remain integer poisha. */
export const MAX_MONEY_MINOR = Number.MAX_SAFE_INTEGER;
export function parseBdtInput(raw: string): number {
  const value = raw.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value))
    throw new Error("Enter a BDT amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(MAX_MONEY_MINOR))
    throw new Error("This BDT amount exceeds the supported limit.");
  return Number(amount);
}
export function formatBdtInput(minor: number | string): string {
  if (!/^\d+$/.test(String(minor))) throw new Error("Invalid poisha amount");
  const amount = BigInt(minor);
  if (amount > BigInt(MAX_MONEY_MINOR))
    throw new Error("Invalid poisha amount");
  return `${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
export function displayBdt(minor: number | string): string {
  const [whole, fraction] = formatBdtInput(minor).split(".");
  return `BDT ${BigInt(whole).toLocaleString("en-US")}.${fraction}`;
}
