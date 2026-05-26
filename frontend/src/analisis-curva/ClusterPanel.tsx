import { useMemo } from "react";
import type { FirmaRecord, CompareCurve } from "./types";
import { CLUSTER_COLORS, POZO_COLORS, pca2d } from "./utils";

const PCA_FEATURES = [
  "p_media",
  "p_std",
  "delta_total",
  "pendiente_inicial",
  "pendiente_final",
  "ratio_pendientes",
  "r2_exponencial",
  "derivada_max_abs",
  "duracion_horas",
] as const;

export function ClusterPanel({
  firmas,
  compareCurves,
  loading,
}: {
  firmas: FirmaRecord[];
  compareCurves: CompareCurve[];
  loading: boolean;
}) {
  const clusters = useMemo(() => {
    const map = new Map<number, FirmaRecord[]>();
    for (const f of firmas) {
      const arr = map.get(f.cluster) ?? [];
      arr.push(f);
      map.set(f.cluster, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [firmas]);

  const curveMap = useMemo(() => {
    const m = new Map<string, CompareCurve>();
    for (const c of compareCurves) {
      m.set(`${c.pad_id}|${c.pozo_id}|${c.timestamp_apertura}`, c);
    }
    return m;
  }, [compareCurves]);

  const pozoColorMap = useMemo(() => {
    const pozos = [...new Set(firmas.map((f) => f.pozo_id))].sort();
    const m = new Map<string, string>();
    pozos.forEach((p, i) => m.set(p, POZO_COLORS[i % POZO_COLORS.length]));
    return m;
  }, [firmas]);

  const pcaPoints = useMemo(() => {
    if (firmas.length < 2) return [];
    try {
      const rows = firmas.map((f) =>
        PCA_FEATURES.map((k) => {
          const v = Number((f as Record<string, unknown>)[k]);
          return Number.isFinite(v) ? v : 0;
        }),
      );
      const pts = pca2d(rows);
      // Reject degenerate result (all NaN/zeros)
      if (pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) return [];
      return pts;
    } catch {
      return [];
    }
  }, [firmas]);

  if (loading) return <div className="loading-card">Cargando firmas de curvas…</div>;

  if (firmas.length === 0) {
    return (
      <div className="loading-card">Sin datos de firma disponibles.</div>
    );
  }

  return (
    <div className="ca-content">
      <div className="pba-section-divider">
        <span>Firma de curvas — producción · curvas por cluster</span>
      </div>

      <div className="extrap-grid">
        {clusters.map(([clusterIdx, clusterFirmas]) => (
          <ClusterChart
            key={clusterIdx}
            clusterIdx={clusterIdx}
            firmas={clusterFirmas}
            curveMap={curveMap}
            pozoColorMap={pozoColorMap}
          />
        ))}
      </div>

      {pcaPoints.length >= 3 && (
        <>
          <div className="pba-section-divider">
            <span>PCA — separación de clusters</span>
          </div>
          <PcaScatter firmas={firmas} points={pcaPoints} />
        </>
      )}
    </div>
  );
}

function ClusterChart({
  clusterIdx,
  firmas,
  curveMap,
  pozoColorMap,
}: {
  clusterIdx: number;
  firmas: FirmaRecord[];
  curveMap: Map<string, CompareCurve>;
  pozoColorMap: Map<string, string>;
}) {
  const curves = firmas
    .map((f) => ({
      firma: f,
      curve: curveMap.get(`${f.pad_id}|${f.pozo_id}|${f.t_inicio}`),
    }))
    .filter((e): e is { firma: FirmaRecord; curve: CompareCurve } =>
      !!e.curve && !e.curve.error && e.curve.curva.length > 0,
    );

  const width = 480;
  const height = 300;
  const pad = { top: 36, right: 20, bottom: 44, left: 56 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const allY = curves.flatMap((e) => e.curve.curva.map((p) => p.p_delta_psi));

  if (allY.length === 0) {
    return (
      <div className="ca-section" style={{ padding: "20px", color: "var(--muted)" }}>
        Cluster {clusterIdx} — sin curvas disponibles
      </div>
    );
  }

  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yPad = (yMax - yMin) * 0.1 || 1;
  const dy = [yMin - yPad, yMax + yPad];

  const xs = (t: number) => pad.left + t * cw;
  const ys = (v: number) => pad.top + (1 - (v - dy[0]) / (dy[1] - dy[0] || 1)) * ch;

  // Mean curve on a regular grid
  const GRID = 80;
  const grid = Array.from({ length: GRID }, (_, i) => i / (GRID - 1));
  const meanY = grid.map((t) => {
    const vals = curves.map(({ curve }) => {
      const pts = curve.curva;
      let lo = 0;
      let hi = pts.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (pts[mid].t_norm <= t) lo = mid;
        else hi = mid;
      }
      const frac =
        pts[hi].t_norm === pts[lo].t_norm
          ? 0
          : (t - pts[lo].t_norm) / (pts[hi].t_norm - pts[lo].t_norm);
      return pts[lo].p_delta_psi + frac * (pts[hi].p_delta_psi - pts[lo].p_delta_psi);
    });
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  });

  const meanPath = grid
    .map((t, i) => `${i === 0 ? "M" : "L"} ${xs(t).toFixed(1)} ${ys(meanY[i]).toFixed(1)}`)
    .join(" ");

  const yTicks = Array.from({ length: 4 }, (_, i) => dy[0] + ((dy[1] - dy[0]) / 3) * i);
  const xTicks = [0, 0.25, 0.5, 0.75, 1.0];

  // Unique pozos in this cluster for legend
  const uniquePozos = [...new Set(firmas.map((f) => f.pozo_id))].sort();

  return (
    <div className="ca-section">
      <div
        style={{
          padding: "14px 18px 0",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: CLUSTER_COLORS[clusterIdx % CLUSTER_COLORS.length],
            flexShrink: 0,
            display: "inline-block",
          }}
        />
        <span
          style={{
            color: "var(--muted)",
            fontSize: "0.82rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Cluster {clusterIdx}
        </span>
        <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>n={firmas.length}</span>
      </div>

      <div className="chart chart--compact" style={{ margin: "8px 14px 14px" }}>
        <svg viewBox={`0 0 ${width} ${height}`}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={ys(tick)}
                y2={ys(tick)}
                stroke="rgba(12,73,120,0.1)"
                strokeDasharray="4 8"
              />
              <text
                x={pad.left - 8}
                y={ys(tick) + 4}
                textAnchor="end"
                className="chart__axis-label"
              >
                {Math.round(tick)}
              </text>
            </g>
          ))}

          {xTicks.map((t) => (
            <text
              key={t}
              x={xs(t)}
              y={height - pad.bottom + 14}
              textAnchor="middle"
              className="chart__axis-label"
            >
              {t.toFixed(2)}
            </text>
          ))}

          {/* Zero reference */}
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={ys(0)}
            y2={ys(0)}
            stroke="rgba(12,73,120,0.18)"
            strokeDasharray="2 5"
          />

          {/* Individual curves */}
          {curves.map(({ firma, curve }, i) => {
            const color = pozoColorMap.get(firma.pozo_id) ?? "#94a3b8";
            const path = curve.curva
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
                strokeWidth="1.5"
                strokeLinecap="round"
                opacity="0.32"
              />
            );
          })}

          {/* Cluster mean */}
          <path
            d={meanPath}
            fill="none"
            stroke="#ef4444"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <text
            x={pad.left + cw / 2}
            y={height - 4}
            textAnchor="middle"
            className="chart__axis-label"
          >
            Tiempo normalizado [0, 1]
          </text>
          <text
            x={14}
            y={pad.top + ch / 2}
            textAnchor="middle"
            className="chart__axis-label"
            transform={`rotate(-90, 14, ${pad.top + ch / 2})`}
          >
            Presión (z-score)
          </text>
        </svg>

        <div className="chart__legend">
          {uniquePozos.map((p) => (
            <div key={p} className="chart__legend-item">
              <span
                className="chart__legend-swatch"
                style={{ background: pozoColorMap.get(p) ?? "#94a3b8" }}
              />
              <span>{p}</span>
            </div>
          ))}
          <div className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: "#ef4444" }} />
            <span>Media del cluster</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PcaScatter({
  firmas,
  points,
}: {
  firmas: FirmaRecord[];
  points: Array<[number, number]>;
}) {
  const width = 580;
  const height = 400;
  const pad = { top: 24, right: 32, bottom: 52, left: 68 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const pcaX = points.map((p) => p[0]);
  const pcaY = points.map((p) => p[1]);
  const xMin = Math.min(...pcaX);
  const xMax = Math.max(...pcaX);
  const yMin = Math.min(...pcaY);
  const yMax = Math.max(...pcaY);
  const xPad = (xMax - xMin) * 0.15 || 1;
  const yPad = (yMax - yMin) * 0.15 || 1;
  const dx = [xMin - xPad, xMax + xPad];
  const dy = [yMin - yPad, yMax + yPad];

  const mapX = (v: number) => pad.left + ((v - dx[0]) / (dx[1] - dx[0] || 1)) * cw;
  const mapY = (v: number) => pad.top + (1 - (v - dy[0]) / (dy[1] - dy[0] || 1)) * ch;

  const uniqueClusters = [...new Set(firmas.map((f) => f.cluster))].sort();

  return (
    <div className="ca-scatter-wrap">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", width: "100%", height: "auto" }}
      >
        {/* Axis lines through origin (if in range) */}
        {dx[0] < 0 && dx[1] > 0 && (
          <line
            x1={mapX(0)}
            x2={mapX(0)}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="rgba(12,73,120,0.12)"
          />
        )}
        {dy[0] < 0 && dy[1] > 0 && (
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={mapY(0)}
            y2={mapY(0)}
            stroke="rgba(12,73,120,0.12)"
          />
        )}

        {firmas.map((f, i) => {
          const color = CLUSTER_COLORS[f.cluster % CLUSTER_COLORS.length];
          const cx = mapX(points[i][0]);
          const cy = mapY(points[i][1]);
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r="7" fill={color} opacity="0.78" />
              <text x={cx + 10} y={cy + 4} fontSize="10" fill="var(--muted)">
                {f.pozo_id}
              </text>
            </g>
          );
        })}

        <text
          x={pad.left + cw / 2}
          y={height - 8}
          textAnchor="middle"
          className="chart__axis-label"
        >
          PC1
        </text>
        <text
          x={16}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 16, ${pad.top + ch / 2})`}
        >
          PC2
        </text>
      </svg>

      <div className="chart__legend">
        {uniqueClusters.map((cl) => (
          <div key={cl} className="chart__legend-item">
            <span
              className="chart__legend-swatch"
              style={{ background: CLUSTER_COLORS[cl % CLUSTER_COLORS.length] }}
            />
            <span>Cluster {cl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
