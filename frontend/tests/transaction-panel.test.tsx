/**
 * @vitest-environment jsdom
 *
 * The write lifecycle panel on the Kit's own mock kit (the boilerplate's
 * approach): priced review before signing, "Confirmed" only for a FINALIZED
 * successful transaction, and a review that cannot change under the signer.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockKit,
  type SubmitInput,
  type TrackedStatus,
  type TransactionKit,
} from "@genlayer/transaction-kit-react";

import { TxPanel } from "../app/components/TxPanel";

const CONTRACT = "0x169cE1cD5aAa013adee55a4B3ed86752cc999375" as const;
const stakeTx: SubmitInput = { kind: "write", address: CONTRACT, method: "stake", args: ["mk-000001", "YES"] };
const fast = { delays: { estimate: 0, submit: 0, step: 0 } };

/** The mock kit stops at "decided"; this one carries the round to finality. */
function finalizingKit(outcome = { statusName: "FINALIZED", executionResultName: "FINISHED_WITH_RETURN" }): TransactionKit {
  const base = createMockKit({ ...fast, outcome });
  return {
    ...base,
    async track(id, onUpdate, opts) {
      const last = await base.track(id, onUpdate, opts);
      const final: TrackedStatus = { ...last, phase: "finalized" };
      onUpdate(final);
      return final;
    },
  };
}

async function approve() {
  const button = await screen.findByRole("button", { name: /sign and send|stake/i });
  fireEvent.click(button);
}

afterEach(() => cleanup());

describe("the transaction panel", () => {
  it("prices the write before anything is signed", async () => {
    render(<TxPanel kit={createMockKit(fast)} tx={stakeTx} value={10n ** 16n} />);
    expect(await screen.findByText("Review before signing")).toBeTruthy();
    expect(screen.getByText("Your stake")).toBeTruthy();
    expect(screen.getByText("Refundable fee deposit")).toBeTruthy();
  });

  it("says Confirmed only for a finalized, successful transaction", async () => {
    const onDone = vi.fn();
    render(<TxPanel kit={finalizingKit()} tx={stakeTx} onDone={onDone} />);
    await approve();
    expect(await screen.findByText(/Confirmed: finalized on chain/)).toBeTruthy();
    // onDone fires from an effect after the outcome renders, so wait for it.
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });

  it("keeps the outcome on screen until the person closes it", async () => {
    const onDone = vi.fn();
    const onClose = vi.fn();
    render(<TxPanel kit={finalizingKit()} tx={stakeTx} onDone={onDone} onClose={onClose} />);
    await approve();
    expect(await screen.findByText(/Confirmed: finalized on chain/)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("never calls an accepted-but-unfinalized write confirmed", async () => {
    const onDone = vi.fn();
    render(<TxPanel kit={createMockKit({ ...fast, outcome: { statusName: "ACCEPTED", executionResultName: "FINISHED_WITH_RETURN" } })}
                    tx={stakeTx} onDone={onDone} />);
    await approve();
    expect(await screen.findByText("Decided, not yet final")).toBeTruthy();
    expect(screen.queryByText(/Confirmed/)).toBeNull();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(false));
  });

  it("reports a finalized refusal as a failure, not a success", async () => {
    const onDone = vi.fn();
    render(<TxPanel kit={finalizingKit({ statusName: "FINALIZED", executionResultName: "FINISHED_WITH_ERROR" })}
                    tx={stakeTx} onDone={onDone} />);
    await approve();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(false));
    expect(screen.queryByText(/Confirmed/)).toBeNull();
  });

  it("freezes the reviewed transaction: a new tx object does not re-price or change what is signed", async () => {
    const kit = createMockKit(fast);
    const estimate = vi.spyOn(kit, "estimate");
    const submit = vi.spyOn(kit, "submit");
    const { rerender } = render(<TxPanel kit={kit} tx={stakeTx} />);
    await screen.findByText("Review before signing");
    rerender(<TxPanel kit={kit} tx={{ ...stakeTx, args: ["mk-000001", "NO"] }} />);
    rerender(<TxPanel kit={kit} tx={{ ...stakeTx, args: ["mk-000001", "NO"] }} />);
    await approve();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(estimate).toHaveBeenCalledTimes(1);
    expect((submit.mock.calls[0] as unknown[])[1]).toEqual(stakeTx);
    await screen.findByText("Decided, not yet final");
  });
});
