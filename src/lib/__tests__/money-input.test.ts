import { describe, it, expect } from "vitest";
import { parseBdtInput, formatBdtInput, displayBdt } from "../money-input";
describe("exact owner BDT boundary", () => {
  it("round-trips decimals and safe integer boundary without floats", () => {
    expect(parseBdtInput("1850.50")).toBe(185050);
    expect(formatBdtInput(185050)).toBe("1850.50");
    expect(displayBdt(185050)).toBe("BDT 1,850.50");
    expect(parseBdtInput("0.01")).toBe(1);
    expect(parseBdtInput(formatBdtInput(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });
  it.each([
    "",
    "-1",
    "1.001",
    "1e3",
    "1,000",
    "1.",
    "NaN",
    "Infinity",
    "90071992547409.92",
  ])("rejects malformed precision/bounds: %s", (value) =>
    expect(() => parseBdtInput(value)).toThrow(),
  );
});
