import { useMemo } from "react";
import type { WellAnalysisRecord } from "./types";
import { formatDT, WELL_COLORS } from "./utils";

export function OverlayChart({ data }: { data: WellAnalysisRecord[] }) {
  const width = 980;
  const height = 380;
  const pad = { top: 28, right: 28, bottom: 56, left: 72 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const byPozo = useMemo(() => {
    const map = new Map<string, WellAnalysisRecord[]>();
    for (const r of data) {
      const list = map.get(r.pozo_id) ?? [];
      list.push(r);
      map.set(r.pozo_id, list);
    }
    return Array.from(map.entries())
      .map(([pozo, records]) => ({
        pozo,
        records: records.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        hidro: records.find((r) => r.P_hidro_boca_psi != null)?.P_hidro_boca_psi ?? null,
      }))
      .filter((g) => g.records.some((r) => r.presion_boca_psi != null));
  }, [data]);

  const allTs = data.map((r) => new Date(r.timestamp).getTime()).filter(isFinite);
  const xMin = Math.min(...allTs);
  const xMax = Math.max(...allTs);

  const allY = data
    .flatMap((r) => [r.presion_boca_psi, r.P_hidro_boca_psi])
    .filter((v): v is number => v != null && isFinite(v));
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yPd = (yMax - yMin) * 0.1 || 10;
  const dy = [yMin - yPd, yMax + yPd];

  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;
  const ys = (v: number) => pad.top + (1 - (v - dy[0]) / (dy[1] - dy[0] || 1)) * ch;

  const yTicks = Array.from({ length: 5 }, (_, i) => dy[0] + ((dy[1] - dy[0]) / 4) * i);
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) / 4) * i);

  if (byPozo.length === 0) {
    return <div className="loading-card">Sin datos de presión de boca para este PAD.</div>;
  }

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Presión boca — overlay PAD">
        {yTicks.map((tick) => {
          const y = ys(tick);
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(12,73,120,0.12)" strokeDasharray="6 10" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="chart__axis-label">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = xs(tick);
          return (
            <g key={tick}>
              <line x1={x} x2={x} y1={pad.top} y2={height - pad.bottom} stroke="rgba(12,73,120,0.1)" strokeDasharray="2 8" />
              <text x={x} y={height - 10} textAnchor="middle" className="chart__axis-label">
                {formatDT(new Date(tick).toISOString())}
              </text>
            </g>
          );
        })}

        {byPozo.map(({ pozo, records, hidro }, ci) => {
          const color = WELL_COLORS[ci % WELL_COLORS.length];
          const pts = records
            .filter((r) => r.presion_boca_psi != null)
            .map((r) => ({ x: xs(new Date(r.timestamp).getTime()), y: ys(r.presion_boca_psi!) }));
          const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

          return (
            <g key={pozo}>
              <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              {hidro != null ? (
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={ys(hidro)}
                  y2={ys(hidro)}
                  stroke={color}
                  strokeWidth="1.4"
                  strokeDasharray="8 5"
                  opacity="0.4"
                />
              ) : null}
            </g>
          );
        })}
      </svg>

      <div className="chart__legend">
        {byPozo.map(({ pozo }, ci) => {
          const color = WELL_COLORS[ci % WELL_COLORS.length];
          return (
            <div key={pozo} className="chart__legend-item">
              <span className="chart__legend-swatch" style={{ background: color }} />
              <span>{pozo}</span>
            </div>
          );
        })}
        <div className="chart__legend-item" style={{ opacity: 0.55 }}>
          <span style={{ width: 18, height: 2, display: "inline-block", borderTop: "2px dashed currentColor", marginTop: 6 }} />
          <span>P. hidrostática</span>
        </div>
      </div>
    </div>
  );
}
