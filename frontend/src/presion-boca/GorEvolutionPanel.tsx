import { useMemo } from "react";
import type { GorEvolutionRecord } from "./types";
import { formatDT } from "./utils";

const COLOR_GOR = "#7cb7ff";
const COLOR_GAS = "#e05555";
const COLOR_LIQ = "#1f77b4";

function fmtNum(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}k`;
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return v.toFixed(v >= 10 ? 0 : 1);
}

function trimZeroEnds(records: GorEvolutionRecord[]): GorEvolutionRecord[] {
  if (records.length === 0) return records;
  const gasMax = Math.max(...records.map((r) => r.gas_m3_hora));
  const liqMax = Math.max(...records.map((r) => r.liq_total_m3_hora));
  const gasThresh = gasMax * 0.01;
  const liqThresh = liqMax * 0.01;
  const isEmpty = (r: GorEvolutionRecord) =>
    r.gas_m3_hora <= gasThresh && r.liq_total_m3_hora <= liqThresh;
  let start = 0;
  let end = records.length - 1;
  while (start <= end && isEmpty(records[start])) start++;
  while (end >= start && isEmpty(records[end])) end--;
  return records.slice(start, end + 1);
}

// ─── Panel GOR ────────────────────────────────────────────────────────────────

function GorPanel({ records }: { records: GorEvolutionRecord[] }) {
  const width = 1400;
  const height = 420;
  const pad = { top: 28, right: 32, bottom: 52, left: 72 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const yBottom = pad.top + ch;

  const ts = records.map((r) => new Date(r.timestamp).getTime());
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);

  const gorValues = records.map((r) => r.gor_m3_m3).filter((v): v is number => v != null);
  const yMax = Math.max(1, ...gorValues) * 1.05;

  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;
  const ys = (v: number) => pad.top + (1 - v / (yMax || 1)) * ch;

  const gorPath = useMemo(() => {
    let path = "";
    let inSegment = false;
    for (const r of records) {
      if (r.gor_m3_m3 == null) {
        inSegment = false;
        continue;
      }
      const x = xs(new Date(r.timestamp).getTime()).toFixed(1);
      const y = ys(r.gor_m3_m3).toFixed(1);
      path += `${inSegment ? "L" : "M"} ${x} ${y} `;
      inSegment = true;
    }
    return path;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records]);

  const xTicks = Array.from({ length: 7 }, (_, i) => xMin + ((xMax - xMin) / 6) * i);
  const yTicks = Array.from({ length: 6 }, (_, i) => (yMax / 5) * i);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="GOR evolución temporal">
        {/* Y grid */}
        {yTicks.map((tick) => {
          const y = ys(tick);
          return (
            <g key={`gy-${tick}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(12,73,120,0.09)" strokeDasharray="6 10" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="chart__axis-label">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {/* X grid */}
        {xTicks.map((tick) => {
          const x = xs(tick);
          return (
            <g key={`gx-${tick}`}>
              <line x1={x} x2={x} y1={pad.top} y2={yBottom} stroke="rgba(12,73,120,0.08)" strokeDasharray="2 8" />
              <text x={x} y={height - pad.bottom + 18} textAnchor="middle" className="chart__axis-label">
                {formatDT(new Date(tick).toISOString())}
              </text>
            </g>
          );
        })}

        {/* GOR line */}
        {gorPath && (
          <path d={gorPath} fill="none" stroke={COLOR_GOR} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Y axis label */}
        <text
          x={16}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 16, ${pad.top + ch / 2})`}
        >
          GOR (m³/m³)
        </text>
      </svg>

      <div className="chart__legend">
        <div className="chart__legend-item">
          <span className="chart__legend-swatch" style={{ background: COLOR_GOR }} />
          <span>GOR (m³/m³)</span>
        </div>
      </div>
    </div>
  );
}

// ─── Panel producción (área gas + línea líquido, doble eje) ───────────────────

function ProductionPanel({ records }: { records: GorEvolutionRecord[] }) {
  const trimmed = useMemo(() => trimZeroEnds(records), [records]);

  const width = 1400;
  const height = 380;
  const pad = { top: 20, right: 72, bottom: 52, left: 72 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;
  const yBottom = pad.top + ch;

  const ts = trimmed.map((r) => new Date(r.timestamp).getTime());
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);

  const gasMax = Math.max(1, ...trimmed.map((r) => r.gas_m3_hora));
  const liqMax = Math.max(1, ...trimmed.map((r) => r.liq_total_m3_hora));

  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;
  const yGasScale = (v: number) => pad.top + (1 - v / gasMax) * ch;
  const yLiqScale = (v: number) => pad.top + (1 - v / liqMax) * ch;

  const gasAreaPath = useMemo(() => {
    if (trimmed.length === 0) return "";
    const top = trimmed
      .map((r, i) => `${i === 0 ? "M" : "L"} ${xs(new Date(r.timestamp).getTime()).toFixed(1)} ${yGasScale(r.gas_m3_hora).toFixed(1)}`)
      .join(" ");
    const lastX = xs(new Date(trimmed[trimmed.length - 1].timestamp).getTime()).toFixed(1);
    const firstX = xs(new Date(trimmed[0].timestamp).getTime()).toFixed(1);
    return `${top} L ${lastX} ${yBottom.toFixed(1)} L ${firstX} ${yBottom.toFixed(1)} Z`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed]);

  const liqPath = useMemo(
    () =>
      trimmed
        .map((r, i) => `${i === 0 ? "M" : "L"} ${xs(new Date(r.timestamp).getTime()).toFixed(1)} ${yLiqScale(r.liq_total_m3_hora).toFixed(1)}`)
        .join(" "),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trimmed],
  );

  const xTicks = Array.from({ length: 7 }, (_, i) => xMin + ((xMax - xMin) / 6) * i);
  const gasYTicks = Array.from({ length: 6 }, (_, i) => (gasMax / 5) * i);
  const liqYTicks = Array.from({ length: 6 }, (_, i) => (liqMax / 5) * i);

  if (trimmed.length === 0) return null;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Caudal de gas y líquido">
        {/* Y grid (gas scale, left) */}
        {gasYTicks.map((tick) => {
          const y = yGasScale(tick);
          return (
            <g key={`gy-${tick}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(12,73,120,0.09)" strokeDasharray="6 10" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="chart__axis-label">
                {fmtNum(tick)}
              </text>
            </g>
          );
        })}

        {/* Right axis ticks (liquid scale) */}
        {liqYTicks.map((tick) => (
          <text key={`ry-${tick}`} x={width - pad.right + 10} y={yLiqScale(tick) + 4} textAnchor="start" className="chart__axis-label">
            {fmtNum(tick)}
          </text>
        ))}

        {/* X grid */}
        {xTicks.map((tick) => {
          const x = xs(tick);
          return (
            <g key={`gx-${tick}`}>
              <line x1={x} x2={x} y1={pad.top} y2={yBottom} stroke="rgba(12,73,120,0.08)" strokeDasharray="2 8" />
              <text x={x} y={height - pad.bottom + 18} textAnchor="middle" className="chart__axis-label">
                {formatDT(new Date(tick).toISOString())}
              </text>
            </g>
          );
        })}

        {/* Gas area */}
        {gasAreaPath && <path d={gasAreaPath} fill={COLOR_GAS} opacity={0.55} />}

        {/* Liquid line */}
        {liqPath && (
          <path d={liqPath} fill="none" stroke={COLOR_LIQ} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Left Y axis label */}
        <text
          x={16}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 16, ${pad.top + ch / 2})`}
        >
          Gas (m³/h)
        </text>

        {/* Right Y axis label */}
        <text
          x={width - 14}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, ${width - 14}, ${pad.top + ch / 2})`}
        >
          Líquido (m³/h)
        </text>
      </svg>

      <div className="chart__legend">
        <div className="chart__legend-item">
          <span className="chart__legend-swatch" style={{ background: COLOR_GAS, opacity: 0.8, borderRadius: 2 }} />
          <span>Gas (m³/h) — eje izquierdo</span>
        </div>
        <div className="chart__legend-item">
          <span className="chart__legend-swatch" style={{ background: COLOR_LIQ }} />
          <span>Líquido total (m³/h) — eje derecho</span>
        </div>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export function GorEvolutionPanel({ records }: { records: GorEvolutionRecord[] }) {
  const sorted = useMemo(
    () => [...records].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [records],
  );

  if (sorted.length === 0) {
    return <div className="loading-card">Sin datos de producción para este PAD.</div>;
  }

  const gorValid = sorted.filter((r) => r.gor_m3_m3 != null);
  const gorMean = gorValid.length > 0 ? gorValid.reduce((s, r) => s + r.gor_m3_m3!, 0) / gorValid.length : null;
  const gasSum = sorted.reduce((s, r) => s + r.gas_m3_hora, 0);
  const liqSum = sorted.reduce((s, r) => s + r.liq_total_m3_hora, 0);

  return (
    <div>
      <div className="metric-strip metric-strip--3">
        <article className="metric-card">
          <span className="metric-card__label">GOR medio</span>
          <strong className="metric-card__value">{gorMean != null ? `${gorMean.toFixed(1)} m³/m³` : "—"}</strong>
          <span className="metric-card__hint">
            {gorValid.length} de {sorted.length} registros con dato
          </span>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Gas acumulado (serie)</span>
          <strong className="metric-card__value">{(gasSum / 1000).toFixed(0)} Mm³</strong>
          <span className="metric-card__hint">Suma de caudales horarios</span>
        </article>
        <article className="metric-card">
          <span className="metric-card__label">Líquido acumulado (serie)</span>
          <strong className="metric-card__value">{liqSum.toFixed(0)} m³</strong>
          <span className="metric-card__hint">Suma de caudales horarios</span>
        </article>
      </div>

      <div style={{ marginTop: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#93a9c9" }}>
          GOR en el tiempo
        </p>
        <GorPanel records={sorted} />
      </div>

      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#93a9c9" }}>
          Caudales del PAD — área gas (eje izq.) · línea líquido (eje der.)
        </p>
        <ProductionPanel records={sorted} />
      </div>
    </div>
  );
}
