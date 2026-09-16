"use client";

/**
 * The pressure-room map: a deliberately low-poly world drawn in this
 * repo — no tile provider, no key, nothing fetched. Equirectangular
 * projection; the catalog's strategic locations plot exactly, the
 * continents are stylized context. Market states color the stations.
 */
import type { ConfigView, MarketView } from "../../lib/types";

const W = 1000;
const H = 460;
const TOP_LAT = 78;
const BOT_LAT = -58;

const px = (lon: number) => ((lon + 180) / 360) * W;
const py = (lat: number) => ((TOP_LAT - lat) / (TOP_LAT - BOT_LAT)) * H;

type Poly = [number, number][]; // [lon, lat]

const LAND: Poly[] = [
  // North + Central America
  [[-168, 66], [-165, 60], [-158, 58], [-148, 60], [-140, 59], [-133, 56], [-127, 51], [-124, 43], [-118, 34], [-110, 24], [-105, 20], [-97, 16], [-92, 15], [-85, 12], [-83, 9], [-79, 9], [-81, 24], [-76, 35], [-70, 42], [-66, 45], [-60, 47], [-53, 47], [-56, 52], [-61, 56], [-65, 60], [-73, 62], [-78, 63], [-85, 66], [-92, 69], [-102, 70], [-112, 68], [-122, 70], [-135, 70], [-150, 71], [-168, 66]],
  // South America
  [[-79, 9], [-72, 12], [-64, 10], [-60, 8], [-52, 5], [-50, 0], [-44, -3], [-35, -8], [-39, -15], [-41, -22], [-48, -26], [-53, -33], [-58, -38], [-62, -41], [-65, -45], [-68, -50], [-69, -55], [-72, -52], [-73, -44], [-71, -33], [-70, -20], [-76, -14], [-80, -5], [-81, 1], [-79, 9]],
  // Africa
  [[-6, 35], [3, 37], [11, 37], [20, 32], [30, 31], [34, 28], [43, 11], [51, 11], [46, -1], [40, -11], [35, -20], [32, -29], [26, -34], [19, -35], [15, -28], [12, -18], [9, -8], [9, 1], [5, 4], [-4, 5], [-8, 4], [-13, 9], [-17, 15], [-16, 21], [-10, 29], [-6, 35]],
  // Europe
  [[-9, 43], [-1, 44], [3, 43], [8, 44], [14, 41], [19, 40], [23, 37], [26, 40], [29, 45], [33, 46], [30, 50], [28, 56], [30, 60], [28, 66], [24, 70], [17, 69], [12, 65], [5, 61], [6, 58], [8, 56], [5, 53], [1, 50], [-2, 48], [-5, 48], [-9, 43]],
  // Asia
  [[28, 66], [40, 67], [55, 68], [70, 72], [90, 74], [110, 73], [130, 71], [142, 72], [158, 70], [172, 67], [179, 64], [170, 60], [161, 57], [156, 51], [147, 44], [139, 41], [135, 35], [129, 35], [122, 30], [121, 23], [108, 17], [105, 9], [100, 6], [97, 7], [94, 16], [88, 22], [80, 14], [77, 7], [72, 19], [66, 24], [58, 25], [52, 29], [44, 30], [36, 36], [30, 41], [27, 41], [30, 46], [38, 45], [48, 43], [52, 47], [48, 55], [40, 60], [32, 62], [28, 66]],
  // Australia
  [[114, -22], [122, -18], [129, -13], [136, -12], [142, -11], [146, -15], [149, -20], [153, -27], [151, -33], [146, -39], [140, -38], [134, -35], [129, -32], [123, -34], [115, -34], [113, -26], [114, -22]],
  // Greenland
  [[-45, 60], [-40, 65], [-32, 68], [-22, 70], [-20, 75], [-32, 78], [-46, 78], [-56, 76], [-54, 70], [-51, 64], [-45, 60]],
  // Britain + Japan, tiny facets so their stations read in place
  [[-5, 50], [1, 52], [-2, 56], [-6, 58], [-8, 54], [-5, 50]],
  [[130, 31], [135, 34], [140, 36], [141, 40], [143, 43], [140, 43], [136, 37], [131, 34], [130, 31]],
];

/** Ambient isobar contours: three closed pressure cells, purely visual. */
const ISOBARS = [
  "M 120 90 q 90 -46 190 -12 q 96 32 62 92 q -32 58 -140 48 q -110 -10 -134 -60 q -16 -40 22 -68 Z",
  "M 560 250 q 70 -40 150 -10 q 78 30 52 80 q -26 48 -116 40 q -92 -8 -110 -50 q -14 -34 24 -60 Z",
  "M 300 330 q 56 -30 118 -8 q 60 22 40 62 q -20 40 -90 32 q -72 -8 -86 -40 q -10 -26 18 -46 Z",
];

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  phase: string | null; // the most actionable market phase at this station
  markets: number;
}

const PHASE_COLOR: Record<string, string> = {
  OPEN: "var(--data)",
  OBSERVING: "var(--warn)",
  RESOLVING: "var(--accent)",
  RESOLVED: "var(--warn)",
  FINAL: "var(--good)",
  VOID: "var(--void)",
};

export function stationsFrom(config: ConfigView, markets: MarketView[]): Station[] {
  const order = ["RESOLVED", "RESOLVING", "OPEN", "OBSERVING", "FINAL", "VOID"];
  return Object.entries(config.locations).map(([id, l]) => {
    const here = markets.filter((m) => m.location_id === id);
    const phase = here.length
      ? order.find((p) => here.some((m) => m.phase === p)) ?? here[0].phase
      : null;
    return { id, name: l.name, lat: l.lat, lon: l.lon, phase, markets: here.length };
  });
}

export function WorldMap({ stations, selected, onSelect }: {
  stations: Station[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="World map of Isobar's strategic weather stations">
      <rect width={W} height={H} fill="var(--ground-2)" />
      {/* graticule */}
      {[-120, -60, 0, 60, 120].map((lon) => (
        <line key={`lon${lon}`} x1={px(lon)} y1={0} x2={px(lon)} y2={H} stroke="var(--line-soft)" strokeWidth="0.6" />
      ))}
      {[60, 30, 0, -30].map((lat) => (
        <line key={`lat${lat}`} x1={0} y1={py(lat)} x2={W} y2={py(lat)} stroke="var(--line-soft)" strokeWidth="0.6" />
      ))}
      <line x1={0} y1={py(0)} x2={W} y2={py(0)} stroke="var(--line)" strokeWidth="0.8" strokeDasharray="3 5" />
      {/* isobar cells */}
      {ISOBARS.map((d, i) => (
        <g key={i}>
          {[0, 7, 14].map((inset) => (
            <path key={inset} d={d} fill="none" stroke="var(--data)" strokeOpacity={0.1 - inset * 0.003}
                  strokeWidth="1" transform={`translate(${inset * 0.6} ${inset * 0.5}) scale(${1 - inset / 220})`} />
          ))}
        </g>
      ))}
      {/* land */}
      {LAND.map((poly, i) => (
        <polygon key={i}
                 points={poly.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join(" ")}
                 fill="var(--surface-2)" stroke="var(--line)" strokeWidth="0.8" strokeLinejoin="round" />
      ))}
      {/* stations */}
      {stations.map((s) => {
        const x = px(s.lon);
        const y = py(s.lat);
        const color = s.phase ? PHASE_COLOR[s.phase] ?? "var(--muted)" : "var(--faint)";
        const isSel = s.id === selected;
        return (
          <g key={s.id} style={{ cursor: "pointer" }} onClick={() => onSelect(s.id)}
             role="button" aria-label={`${s.name}: ${s.markets} market${s.markets === 1 ? "" : "s"}`}>
            {s.phase === "RESOLVING" || s.phase === "RESOLVED" ? (
              <circle cx={x} cy={y} r={11} fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1">
                <animate attributeName="r" values="7;13;7" dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.5;0.08;0.5" dur="2.6s" repeatCount="indefinite" />
              </circle>
            ) : null}
            <circle cx={x} cy={y} r={isSel ? 6.5 : 4.6} fill={color} stroke="var(--ground)" strokeWidth="1.6" />
            {s.markets > 0 ? (
              <text x={x} y={y - 9} textAnchor="middle" fontSize="9.5" fill="var(--muted)"
                    fontFamily="var(--font-data)">{s.markets}</text>
            ) : null}
            {isSel ? (
              <text x={x} y={y + 19} textAnchor="middle" fontSize="10.5" fill="var(--ink)"
                    fontFamily="var(--font-body)" fontWeight={600}>{s.name}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export const PHASE_LEGEND = [
  { phase: "OPEN", text: "Open for positions" },
  { phase: "OBSERVING", text: "Observation running" },
  { phase: "RESOLVING", text: "Ready to resolve" },
  { phase: "RESOLVED", text: "Appeal window" },
  { phase: "FINAL", text: "Settled" },
] as const;

export { PHASE_COLOR };
