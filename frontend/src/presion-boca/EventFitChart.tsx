import { useEffect, useRef, useState } from "react";
import type { ExtrapolationEvent } from "./types";
import { buildApiUrl, postJson } from "./api";
import { downloadSvg, formatEventDate } from "./utils";

export function EventFitChart({ event }: { event: ExtrapolationEvent }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [excludedIdxs, setExcludedIdxs] = useState<Set<number>>(new Set());
  const [recalcData, setRecalcData] = useState<ExtrapolationEvent | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  useEffect(() => {
    setExcludedIdxs(new Set());
    setRecalcData(null);
    setRecalcError(null);
  }, [event.timestamp_evento]);

  const displayEvent = recalcData ?? event;
  const remainingCount = event.t_rel.length - excludedIdxs.size;
  const canRecalculate = excludedIdxs.size > 0 && remainingCount >= 4;
  const hasChanges = excludedIdxs.size > 0 || recalcData != null;

  function togglePoint(i: number) {
    setExcludedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
    setRecalcData(null);
    setRecalcError(null);
  }

  async function handleRecalculate() {
    const kept = event.t_rel.map((_, i) => i).filter((i) => !excludedIdxs.has(i));
    setRecalcLoading(true);
    setRecalcError(null);
    try {
      const result = await postJson<ExtrapolationEvent>(
        buildApiUrl("/pressure-extrapolation/recalculate"),
        {
          pozo_id: event.pozo_id,
          pad_id: event.pad_id,
          timestamp_evento: event.timestamp_evento,
          tipo_evento: event.tipo_evento,
          tp_horas: event.tp_horas,
          t_rel: kept.map((i) => event.t_rel[i]),
          p_obs: kept.map((i) => event.p_obs[i]),
        },
      );
      setRecalcData(result);
    } catch (err) {
      setRecalcError(err instanceof Error ? err.message : "Error al recalcular");
    } finally {
      setRecalcLoading(false);
    }
  }

  function handleReset() {
    setExcludedIdxs(new Set());
    setRecalcData(null);
    setRecalcError(null);
  }

  const width = 980;
  const height = 400;
  const pad = { top: 28, right: 32, bottom: 56, left: 76 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  // Scale always based on original data for stability during interaction
  const tMax = Math.max(...event.t_rel, 0.1) * 1.05;
  const tMin = -tMax * 0.03;

  const N = 160;
  const tFine = Array.from({ length: N }, (_, i) => (i / (N - 1)) * tMax);

  const expCurve =
    displayEvent.params_exp != null
      ? tFine.map((t) => displayEvent.params_exp!.P_estable + displayEvent.params_exp!.A * Math.exp(-displayEvent.params_exp!.k * t))
      : null;

  const slogCurve =
    displayEvent.a_slog != null && displayEvent.b_slog != null
      ? tFine.map((t) => displayEvent.a_slog! * Math.log(t + 0.5) + displayEvent.b_slog!)
      : null;

  const allY = [
    ...event.p_obs,
    ...(expCurve ?? []),
    ...(slogCurve ?? []),
    ...(displayEvent.P_estimada_exp != null ? [displayEvent.P_estimada_exp] : []),
    ...(displayEvent.P_estimada_semilog != null ? [displayEvent.P_estimada_semilog] : []),
  ].filter(Number.isFinite);

  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yPd = (yMax - yMin) * 0.14 || 10;
  const dy = [yMin - yPd, yMax + yPd];

  const xs = (t: number) => pad.left + ((t - tMin) / (tMax - tMin)) * cw;
  const ys = (v: number) => pad.top + (1 - (v - dy[0]) / (dy[1] - dy[0] || 1)) * ch;

  const yTicks = Array.from({ length: 5 }, (_, i) => dy[0] + ((dy[1] - dy[0]) / 4) * i);
  const xTicks = Array.from({ length: 6 }, (_, i) => (i / 5) * tMax);

  const buildPath = (values: number[]) =>
    tFine.map((t, i) => `${i === 0 ? "M" : "L"} ${xs(t).toFixed(1)} ${ys(values[i]).toFixed(1)}`).join(" ");

  const x0 = xs(0);
  const downloadFilename = `extrapolacion_${event.pozo_id}_${event.timestamp_evento.slice(0, 10)}`;

  return (
    <div className="chart">
      <div className="pba-fit-toolbar">
        <span className="pba-fit-title">
          {event.pozo_id} — apertura — {formatEventDate(event.timestamp_evento)} |{" "}
          N={recalcData ? `${recalcData.N_puntos}/${event.N_puntos}` : event.N_puntos} puntos
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {excludedIdxs.size > 0 && !recalcData && (
            <span style={{ fontSize: 12, color: remainingCount < 4 ? "#94a3b8" : "#ef4444" }}>
              {excludedIdxs.size} excluido{excludedIdxs.size !== 1 ? "s" : ""} — {remainingCount} restante{remainingCount !== 1 ? "s" : ""}
              {remainingCount < 4 ? " (mín. 4)" : ""}
            </span>
          )}
          {recalcData && (
            <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Recalculado</span>
          )}
          {hasChanges && (
            <button type="button" className="pba-download-btn" onClick={handleReset}>
              Restablecer
            </button>
          )}
          {excludedIdxs.size > 0 && !recalcData && (
            <button
              type="button"
              className="pba-download-btn"
              onClick={handleRecalculate}
              disabled={!canRecalculate || recalcLoading}
            >
              {recalcLoading ? "Calculando…" : "Recalcular"}
            </button>
          )}
          <button
            type="button"
            className="pba-download-btn"
            onClick={() => svgRef.current && downloadSvg(svgRef.current, downloadFilename)}
          >
            ↓ SVG
          </button>
        </div>
      </div>

      {recalcError && (
        <div className="upload__status upload__status--error" style={{ marginBottom: 8 }}>
          {recalcError}
        </div>
      )}

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Ajuste de extrapolación — ${event.pozo_id}`}
      >
        {yTicks.map((tick) => {
          const y = ys(tick);
          return (
            <g key={`y-${tick}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(12,73,120,0.08)" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="chart__axis-label">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => (
          <text
            key={`x-${tick}`}
            x={xs(tick)}
            y={height - pad.bottom + 16}
            textAnchor="middle"
            className="chart__axis-label"
          >
            {tick.toFixed(1)}
          </text>
        ))}

        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="rgba(12,73,120,0.2)" />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} stroke="rgba(12,73,120,0.2)" />
        <line x1={x0} x2={x0} y1={pad.top} y2={height - pad.bottom} stroke="rgba(63,91,116,0.22)" strokeDasharray="3 4" />

        {slogCurve ? (
          <path d={buildPath(slogCurve)} fill="none" stroke="#dc2626" strokeWidth="2.4" strokeDasharray="10 6" strokeLinecap="round" />
        ) : null}
        {expCurve ? (
          <path d={buildPath(expCurve)} fill="none" stroke="#1d4ed8" strokeWidth="2.6" strokeLinecap="round" />
        ) : null}

        {/* Observed points — click to toggle exclusion */}
        {event.t_rel.map((t, i) => {
          const excluded = excludedIdxs.has(i);
          return (
            <circle
              key={i}
              cx={xs(t)}
              cy={ys(event.p_obs[i])}
              r="6"
              fill={excluded ? "#ef4444" : "#4a7fa5"}
              opacity={excluded ? 0.4 : 1}
              style={{ cursor: "pointer" }}
              onClick={() => togglePoint(i)}
            />
          );
        })}

        {displayEvent.P_estimada_exp != null ? (
          <text x={x0} y={ys(displayEvent.P_estimada_exp)} textAnchor="middle" dominantBaseline="middle" fill="#1d4ed8" fontSize="20" fontWeight="bold">
            ★
          </text>
        ) : null}
        {displayEvent.P_estimada_semilog != null ? (
          <text x={x0} y={ys(displayEvent.P_estimada_semilog)} textAnchor="middle" dominantBaseline="middle" fill="#dc2626" fontSize="20" fontWeight="bold">
            ★
          </text>
        ) : null}

        <text x={pad.left + cw / 2} y={height - 8} textAnchor="middle" className="chart__axis-label" fontWeight="600">
          Tiempo relativo al evento (horas)
        </text>
        <text x={18} y={pad.top + ch / 2} textAnchor="middle" className="chart__axis-label" transform={`rotate(-90, 18, ${pad.top + ch / 2})`}>
          Presión boca (psi)
        </text>
      </svg>

      <div className="pba-fit-footer">
        <div className="chart__legend">
          <div className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: "#4a7fa5", borderRadius: "50%" }} />
            <span>Observado (click para excluir)</span>
          </div>
          <div className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: "#ef4444", borderRadius: "50%", opacity: 0.5 }} />
            <span>Excluido</span>
          </div>
          {expCurve ? (
            <div className="chart__legend-item">
              <span style={{ width: 18, display: "inline-block", borderTop: "2.5px solid #1d4ed8", marginTop: 6 }} />
              <span>Exponencial</span>
            </div>
          ) : null}
          {slogCurve ? (
            <div className="chart__legend-item">
              <span style={{ width: 18, display: "inline-block", borderTop: "2.5px dashed #dc2626", marginTop: 6 }} />
              <span>Semilog</span>
            </div>
          ) : null}
        </div>

        <div className="pba-fit-metrics">
          {displayEvent.P_estimada_exp != null ? (
            <div className="pba-fit-metric">
              <span className="pba-fit-metric__star" style={{ color: "#1d4ed8" }}>★</span>
              <div>
                <strong>P(t=0) Exp = {displayEvent.P_estimada_exp.toFixed(1)} psi</strong>
                <span>R² = {displayEvent.R2_exp?.toFixed(3) ?? "—"}</span>
              </div>
            </div>
          ) : null}
          {displayEvent.P_estimada_semilog != null ? (
            <div className="pba-fit-metric">
              <span className="pba-fit-metric__star" style={{ color: "#dc2626" }}>★</span>
              <div>
                <strong>P(t=0) Slog = {displayEvent.P_estimada_semilog.toFixed(1)} psi</strong>
                <span>R² = {displayEvent.R2_semilog?.toFixed(3) ?? "—"}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
