import Link from "next/link";

import { addressUrl, EXPLORER } from "../../lib/chain";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED } from "../../lib/config";

export const metadata = { title: "How Isobar works" };

export default function HowPage() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }} className="stack">
      <div>
        <h1 style={{ fontSize: 30 }}>How it works</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          The whole mechanism, in the order money meets it. Everything below is enforced by
          one intelligent contract on GenLayer Studio Next
          {CONTRACT_CONFIGURED ? (
            <>: <a className="mono" href={addressUrl(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer" style={{ overflowWrap: "anywhere" }}>{CONTRACT_ADDRESS}</a></>
          ) : null}.
        </p>
      </div>

      <section className="card">
        <h3>1 · A market is one falsifiable question</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          Will a daily weather metric cross a fixed threshold at a fixed coordinate on a fixed
          UTC date? Location, metric, comparison and date all come from the contract&apos;s own
          catalog: sixteen strategic logistics points, three metrics. Nobody supplies a URL,
          a station id, or any text a panel could be steered by. Anyone can open a market;
          opening one grants no powers over it.
        </p>
      </section>

      <section className="card">
        <h3>2 · Positions are a parimutuel pool</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          Stake GEN on Yes or No until the observation date begins. After that, nobody bets
          on weather already measured. There are no odds and no market maker: when the market
          settles, winners split the losing pool in proportion to their stakes, and a market
          with no counterparty simply refunds. Every refused stake is returned through the
          claim ledger, never kept.
        </p>
      </section>

      <section className="card">
        <h3>3 · Evidence: two independent sources, fetched by every validator</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          The contract builds both evidence URLs in code. Worldwide, that is Open-Meteo (the
          ERA5 reanalysis) and NASA POWER (the MERRA-2 reanalysis): different organizations,
          different data lineages. At four US ports a fast lane reads the National Weather
          Service station itself alongside Open-Meteo. Reanalysis data trails the calendar, so
          each market states when it becomes resolvable: about two days after the date on the
          fast lane, about five on the global lane.
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>
          When resolution runs, <b>every validator fetches both sources itself</b> and the
          recorded evidence must match across the panel line by line: readings exactly,
          excerpts of the normalized payload, digests that cover exactly what is stored. A
          leader cannot slip a page nobody else saw into the record.
        </p>
      </section>

      <section className="card">
        <h3>4 · The panel judges data quality; code derives the verdict</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          The AI panel answers narrow questions: does each payload truly cover the date, is
          anything anomalous, and is the data trustworthy enough to settle on? Each claim is
          backed by a quote that must appear verbatim in the fetched payload. The panel never
          sees the threshold, the sides, or the pools. Deterministic contract code then
          derives the verdict from the agreed readings:
        </p>
        <ul className="small muted" style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.8 }}>
          <li>both sources over the threshold → <b>Yes</b>; both under → <b>No</b>;</li>
          <li>sources split, in either direction → <b>void</b>, every stake refunded;</li>
          <li>fewer than two sources covering the date → no verdict, the round retries:
              <i> no corroboration, no settlement</i>;</li>
          <li>the panel judging the data insufficient blocks Yes and No alike.</li>
        </ul>
      </section>

      <section className="card">
        <h3>5 · One appeal, against the record</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          For a fixed window after resolution (stated on every market page), any wallet with
          money at stake can file the market&apos;s one appeal. A fresh panel re-reads the
          <b> recorded</b> evidence (the exact bytes the first round agreed on, nothing
          refetched) plus the appellant&apos;s grounds, which are marked as argument, not
          evidence. The same derivation runs again: it can uphold the verdict or void the
          market. It can never invent a new outcome. Settlement waits for the window or the
          appeal, whichever the record shows.
        </p>
      </section>

      <section className="card">
        <h3>6 · Settlement, claims, and the escape hatch</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          Finalizing a market credits every wallet&apos;s share to its claimable balance in
          one pass, exactly once; claiming moves it to your wallet. Both are permissionless.
          A market that can never reach a verdict (sources dark for weeks) has a
          permissionless timeout that voids it and frees every stake. No state in the
          contract waits on someone who might never act.
        </p>
      </section>

      <section className="card">
        <h3>7 · The parlay, priced honestly</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          A ticket chains two to four open markets; every leg must land your way. The
          multiplier is <b>flat demo pricing</b> (about 1.8× per leg, capped). It is not
          derived from the pools, and every surface says so. The full potential payout is
          reserved from a visible, deployer-seeded on-chain reserve the moment the ticket is
          bought; without headroom the purchase is refused in words. A voided leg drops out
          of the multiplier; a ticket of only voided legs refunds; a lost ticket&apos;s stake
          goes to the reserve, disclosed.
        </p>
      </section>

      <section className="card">
        <h3>8 · What to verify, and where</h3>
        <p className="small muted" style={{ marginTop: 8 }}>
          Every round is a finalized transaction on{" "}
          <a href={EXPLORER} target="_blank" rel="noreferrer">the Studio Next explorer</a>.
          Every market page carries a verification view with the exact URLs, the recorded
          readings, and the digests over the stored excerpts. The evidence APIs are public
          and keyless: paste a recorded URL into your browser and read what the validators
          read.
        </p>
        <p className="small muted" style={{ marginTop: 8 }}>
          Honest limits: verdicts are daily-resolution UTC thresholds, not minute-level
          claims; reanalysis sources genuinely disagree sometimes, which is why the split
          rule voids instead of guessing; and this deployment runs on test GEN. It is a
          working mechanism, not a licensed financial product.
        </p>
      </section>

      <p className="fine">
        Ready? <Link href="/markets">The docket</Link> · <Link href="/map">the map</Link> ·{" "}
        <Link href="/parlay">the parlay builder</Link>.
      </p>
    </div>
  );
}
