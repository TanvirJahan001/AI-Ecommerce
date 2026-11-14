import { describe, expect, it } from "vitest";
import { bdt, formatBdt } from "../money";

describe("BDT minor-unit money", () => {
  it("rejects negative, fractional and unsafe amounts", () => {
    expect(() => bdt(-1)).toThrow();
    expect(() => bdt(1.5)).toThrow();
    expect(() => bdt(Number.MAX_SAFE_INTEGER + 1)).toThrow();
  });
  it("formats integer poisha without float arithmetic in business rules", () => {
    expect(bdt(125050)).toEqual({ currency: "BDT", amountMinor: 125050 });
    expect(formatBdt(bdt(125050))).toContain("1,250.50");
  });
});
