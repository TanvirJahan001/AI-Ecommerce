export type Bdt = Readonly<{ currency: "BDT"; amountMinor: number }>;
export function bdt(amountMinor: number): Bdt {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
    throw new Error("Invalid BDT amount");
  return { currency: "BDT", amountMinor };
}
export function formatBdt(value: Bdt): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
  }).format(value.amountMinor / 100);
}
