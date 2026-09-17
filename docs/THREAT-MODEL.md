# Threat model

Who could cheat whom, and what stands in the way. Every wall here has a
direct test, most have a mutation check, and the on-chain refusals were
exercised live (receipts in the README table).

## A market creator

*Steer the evidence.* Impossible by construction: creation chooses only
catalog coordinates, a metric, a threshold and a date. The contract builds
the URLs; there is no source field to abuse, no label the panel weighs.

*Open a market on weather already measured.* Creation requires the
observation date to lie in the future; positions close the second it
begins.

## A staker

*Bet after the answer is knowable.* Same wall: stakes are refused from the
window's first second, and the refused value is credited straight back.

*Flood the book.* Per-wallet stake caps, a bounded staker registry, a
bounded market count. Every cap refuses in words.

## A malicious leader (the strongest adversary)

*Fabricate a reading.* Validators re-fetch both sources and compare the
recorded reading; a fabricated value prints `[DISAGREE] reading differs`
and fails the round.

*Store bytes nobody else saw, behind a self-consistent digest.* The digest
must cover the stored excerpt AND the excerpt must be prefix-compatible
with each validator's own fetch of the same stable form; an internally
consistent forgery still fails prefix comparison. The empty string
(a prefix of everything) is refused explicitly on a fetched row.

*Claim coverage during an outage only the leader escaped.* A validator
that cannot fetch a source the leader calls covered refuses the round;
majority decides, so one flaky node cannot veto and one lying leader
cannot pass.

*Lean on the panel.* The panel's only compared outputs are per-source
covered flags and one sufficiency bit; each depends on a quote grounded in
the fetched payload, and an ungrounded claim is downgraded in code before
derivation. There is no confidence score, no severity, no field outside
equivalence that money reads.

## A losing party

*Appeal forever.* One appeal per market, refused thereafter with the
contract's sentence.

*Appeal with fresh, curated evidence.* The appeal panel reads the recorded
snapshot only; the test suite asserts zero fetches during an appeal.
Grounds are defused so typed text cannot impersonate a fetched fence.

*Grief by appealing with no stake.* Appeal standing requires a position or
a ticket on the market.

*Settle before the other side can dispute.* Finalize refuses while the
window is open and no appeal is on the record, proven live, including a
void verdict's own window.

## The operator / deployer

Holds exactly two powers: seeding the parlay reserve and withdrawing
capital **no live ticket needs** (exposure-checked). Cannot touch markets,
verdicts, pools, the ledger, or anyone's claim. Every other verb is
permissionless or bound to the signer.

## The platform

*A payable write that reverts still credits the contract* (measured on
this network), so refusals credit the value back to the sender's ledger
instead of relying on revert semantics.

*Long pending spells happen* (an 83-minute finality gap was observed
mid-run). Nothing in the contract depends on timely inclusion; windows
are generous multiples of observed lag, and the timeout void frees stakes
if resolution never lands.

## Residual risks, stated plainly

- Both global-lane sources are reanalyses; a shared systematic error would
  agree confidently. Mitigated by choosing different lineages (ERA5 vs
  MERRA-2) and a station lane where real observations exist; not
  eliminated.
- The catalog is fixed at deploy; a bad coordinate would need a new
  deployment. Deliberate: an editable catalog would be a steering surface.
- Demo parlay pricing is not risk-priced; the reserve cap and stake caps
  bound the worst case, and every surface says what the pricing is.
