import type { CompareCurve } from "./types";
import { formatDateTime } from "./utils";

const LINE_COLORS = [
  "#0f9a4c",
  "#0d6fd6",
  "#e07b00",
  "#9333ea",
  "#0891b2",
  "#be185d",
  "#16a34a",
  "#dc2626",
];

export function CompareChart({ curves }: { curves: CompareCurve[] }) {
  const valid = curves.filter((c) => !c.error && c.curva.length > 0);
  if (valid.length === 0) return null;

  const width = 960;
  const height = 380;
  const pad = { top: 28, right: 24, bottom: 64, left: 72 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const allY = valid.flatMap((c) => c.curva.map((p) => p.p_delta_psi));
  const yMin = Math.min(...allY, 0);
  const yMax = Math.max(...allY, 0);
  const yPad = (yMax - yMin) * 0.1 || 1;
  const dy = [yMin - yPad, yMax + yPad];

  const xs = (t: number) => pad.left + t * cw;
  const ys = (v: number) => pad.top + (1 - (v - dy[0]) / (dy[1] - dy[0] || 1)) * ch;

  const yTicks = Array.from({ length: 5 }, (_, i) => dy[0] + ((dy[1] - dy[0]) / 4) * i);
  const xTicks = [0, 0.25, 0.5, 0.75, 1.0];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} aria-label="Comparación normalizada de ciclos">
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={ys(tick)}
              y2={ys(tick)}
              stroke="rgba(12,73,120,0.1)"
              strokeDasharray="6 10"
            />
            <text x={pad.left - 10} y={ys(tick) + 4} textAnchor="end" className="chart__axis-label">
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {xTicks.map((t) => (
          <g key={t}>
            <line
              x1={xs(t)}
              x2={xs(t)}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="rgba(12,73,120,0.07)"
              strokeDasharray="2 8"
            />
            <text
              x={xs(t)}
              y={height - pad.bottom + 16}
              textAnchor="middle"
              className="chart__axis-label"
            >
              {t.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Zero reference */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={ys(0)}
          y2={ys(0)}
          stroke="rgba(12,73,120,0.22)"
          strokeDasharray="3 5"
        />

        {valid.map((c, i) => {
          const color = LINE_COLORS[i % LINE_COLORS.length];
          const path = c.curva
            .map(
              (p, j) =>
                `${j === 0 ? "M" : "L"} ${xs(p.t_norm).toFixed(1)} ${ys(p.p_delta_psi).toFixed(1)}`,
            )
            .join(" ");
          return (
            <path
              key={i}
              d={path}
              fill="none"
              stroke={color}
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        <text
          x={pad.left + cw / 2}
          y={height - 6}
          textAnchor="middle"
          className="chart__axis-label"
        >
          Tiempo normalizado [0, 1]
        </text>
        <text
          x={16}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 16, ${pad.top + ch / 2})`}
        >
          ΔP respecto P₀ (psi)
        </text>
      </svg>

      <div className="chart__legend">
        {valid.map((c, i) => (
          <div key={i} className="chart__legend-item">
            <span
              className="chart__legend-swatch"
              style={{ background: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <span>
              {c.pozo_id} — {formatDateTime(c.timestamp_apertura)} — P₀={Math.round(c.P0)} psi
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
