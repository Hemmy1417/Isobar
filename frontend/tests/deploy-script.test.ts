import { describe, expect, it } from "vitest";

import { contractBytes, isSuccessfulDeploymentReceipt } from "../../deploy/deployScript";

describe("deployment receipt success", () => {
  it("does not treat UNDETERMINED as a successful deployment", () => {
    expect(isSuccessfulDeploymentReceipt({ status: 6, statusName: "UNDETERMINED" })).toBe(false);
  });

  it("accepts only accepted or finalized decisions", () => {
    expect(isSuccessfulDeploymentReceipt({ status: 5 })).toBe(true);
    expect(isSuccessfulDeploymentReceipt({ statusName: "FINALIZED" })).toBe(true);
    expect(isSuccessfulDeploymentReceipt({ statusName: "LEADER_TIMEOUT" })).toBe(false);
  });
});

describe("deployed bytes match the repository", () => {
  it("refuses CRLF sources, which byte verification could never match", () => {
    const crlf = new TextEncoder().encode("# header\r\nclass Isobar:\r\n    pass\r\n");
    expect(() => contractBytes(crlf)).toThrow(/CR bytes/);
  });

  it("passes LF sources through untouched", () => {
    const lf = new TextEncoder().encode("# header\nclass Isobar:\n    pass\n");
    expect(contractBytes(lf)).toBe(lf);
  });
});
