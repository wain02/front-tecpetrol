import type { CicloDetalle } from "./types";
import { formatDT } from "./utils";

export function CycleDetailChart({
  detalle,
  compact = false,
}: {
  detalle: CicloDetalle;
  compact?: boolean;
}) {
  const { serie_temporal, n_etapa1, P0 } = detalle;

  const width = 960;
  const height = compact ? 340 : 420;
  const pad = { top: 28, right: 80, bottom: 72, left: 76 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const sorted = [...serie_temporal].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (sorted.length === 0) return null;

  const ts = sorted.map((r) => new Date(r.timestamp).getTime());
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);

  const yVals = sorted.map((r) => r.presion_boca_psi);
  const allY = [...yVals, P0];
  const yMinRaw = Math.min(...allY);
  const yMaxRaw = Math.max(...allY);
  const yPadding = (yMaxRaw - yMinRaw) * 0.1 || 10;
  const dy = [yMinRaw - yPadding, yMaxRaw + yPadding];

  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;
  const ys = (v: number) => pad.top + (1 - (v - dy[0]) / (dy[1] - dy[0] || 1)) * ch;

  const prPath = sorted
    .map((r, i) => `${i === 0 ? "M" : "L"} ${xs(ts[i]).toFixed(1)} ${ys(r.presion_boca_psi).toFixed(1)}`)
    .join(" ");


  const etapa1T = n_etapa1 > 0 && n_etapa1 < sorted.length
    ? new Date(sorted[n_etapa1].timestamp).getTime()
    : null;

  const yTicks = Array.from({ length: 5 }, (_, i) => dy[0] + ((dy[1] - dy[0]) / 4) * i);
  const xTicks = Array.from({ length: 6 }, (_, i) => xMin + ((xMax - xMin) / 5) * i);

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Serie temporal del ciclo"
      >
        {/* Etapa 1 shading */}
        {etapa1T && (
          <rect
            x={pad.left}
            y={pad.top}
            width={Math.max(xs(etapa1T) - pad.left, 0)}
            height={ch}
            fill="rgba(15,154,76,0.07)"
          />
        )}

        {/* Horizontal grid */}
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
            <text
              x={pad.left - 10}
              y={ys(tick) + 4}
              textAnchor="end"
              className="chart__axis-label"
            >
              {Math.round(tick)}
            </text>
          </g>
        ))}

        {/* Vertical grid + x labels */}
        {xTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={xs(tick)}
              x2={xs(tick)}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="rgba(12,73,120,0.08)"
              strokeDasharray="2 8"
            />
            <text
              x={xs(tick)}
              y={height - pad.bottom + 16}
              textAnchor="middle"
              className="chart__axis-label"
            >
              {formatDT(new Date(tick).toISOString())}
            </text>
          </g>
        ))}

        {/* P0 reference line */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={ys(P0)}
          y2={ys(P0)}
          stroke="#0d6fd6"
          strokeWidth="1.5"
          strokeDasharray="8 5"
          opacity="0.7"
        />
        <text
          x={width - pad.right + 6}
          y={ys(P0) + 4}
          textAnchor="start"
          className="chart__threshold"
          fill="#0d6fd6"
        >
          P₀={Math.round(P0)} psi
        </text>

        {/* Etapa 1 boundary */}
        {etapa1T && (
          <>
            <line
              x1={xs(etapa1T)}
              x2={xs(etapa1T)}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="#0f9a4c"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.6"
            />
            <text
              x={xs(etapa1T) + 5}
              y={pad.top + 14}
              className="chart__threshold"
              fill="#0f9a4c"
            >
              fin E1
            </text>
          </>
        )}

        {/* Main pressure */}
        <path
          d={prPath}
          fill="none"
          stroke="#0f9a4c"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Axis labels */}
        <text
          x={18}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 18, ${pad.top + ch / 2})`}
        >
          Presión boca (psi)
        </text>
        <text
          x={pad.left + cw / 2}
          y={height - 8}
          textAnchor="middle"
          className="chart__axis-label"
        >
          Tiempo
        </text>
      </svg>

      <div className="chart__legend">
        <div className="chart__legend-item">
          <span className="chart__legend-swatch" style={{ background: "#0f9a4c" }} />
          <span>Presión boca (psi)</span>
        </div>
        <div className="chart__legend-item">
          <span
            style={{
              width: 18,
              display: "inline-block",
              borderTop: "2px dashed #0d6fd6",
              marginTop: 6,
            }}
          />
          <span>P₀ inicial</span>
        </div>
        {etapa1T && (
          <div className="chart__legend-item">
            <span
              style={{
                width: 16,
                height: 10,
                display: "inline-block",
                background: "rgba(15,154,76,0.15)",
                border: "1px solid rgba(15,154,76,0.35)",
                borderRadius: 2,
              }}
            />
            <span>Etapa 1 (primer 15%)</span>
          </div>
        )}
      </div>
    </div>
  );
}
