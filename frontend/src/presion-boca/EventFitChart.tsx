import { useEffect, useRef, useState } from "react";
import type { ExtrapolationEvent } from "./types";
import { buildApiUrl, postJson } from "./api";
import { downloadSvg, formatEventDate } from "./utils";

export function EventFitChart({
  event,
  onSaved,
}: {
  event: ExtrapolationEvent;
  onSaved?: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [excludedIdxs, setExcludedIdxs] = useState<Set<number>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [recalcData, setRecalcData] = useState<ExtrapolationEvent | null>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  // When a saved recalculation exists, t_rel_original/p_obs_original hold all pipeline points;
  // t_rel/p_obs hold only the subset used in the saved recalc.
  const fullTRel = event.t_rel_original ?? event.t_rel;
  const fullPObs = event.p_obs_original ?? event.p_obs;
  const hasRecalcSaved = !!event.t_rel_original;

  // Re-initialize when the event changes (timestamp or saved selection changes)
  const savedSelectionKey = (event.puntos_seleccionados ?? []).toString();
  useEffect(() => {
    setRecalcData(null);
    setRecalcError(null);
    setSaveError(null);
    setSaveSuccess(false);
    setShowOriginal(false);
    setIsDirty(false);
    if (event.t_rel_original) {
      const selectedSet = new Set(event.puntos_seleccionados ?? []);
      setExcludedIdxs(
        new Set(event.t_rel_original.map((_, i) => i).filter((i) => !selectedSet.has(i))),
      );
    } else {
      setExcludedIdxs(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.timestamp_evento, savedSelectionKey]);

  const displayEvent = recalcData ?? event;
  const remainingCount = fullTRel.length - excludedIdxs.size;
  const canRecalculate = isDirty && remainingCount >= 4;
  const hasChanges = isDirty || recalcData != null;

  function togglePoint(i: number) {
    setExcludedIdxs((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setIsDirty(true);
    setRecalcData(null);
    setRecalcError(null);
    setSaveSuccess(false);
  }

  async function handleRecalculate() {
    const kept = fullTRel.map((_, i) => i).filter((i) => !excludedIdxs.has(i));
    setRecalcLoading(true);
    setRecalcError(null);
    setSaveSuccess(false);
    try {
      const result = await postJson<ExtrapolationEvent>(
        buildApiUrl("/pressure-extrapolation/recalculate"),
        {
          pozo_id: event.pozo_id,
          pad_id: event.pad_id,
          timestamp_evento: event.timestamp_evento,
          tipo_evento: event.tipo_evento,
          tp_horas: event.tp_horas ?? null,
          t_rel: kept.map((i) => fullTRel[i]),
          p_obs: kept.map((i) => fullPObs[i]),
        },
      );
      setRecalcData(result);
    } catch (err) {
      setRecalcError(err instanceof Error ? err.message : "Error al recalcular");
    } finally {
      setRecalcLoading(false);
    }
  }

  async function handleSave() {
    if (!recalcData) return;
    const keptIdxs = fullTRel.map((_, i) => i).filter((i) => !excludedIdxs.has(i));
    setSaveLoading(true);
    setSaveError(null);
    try {
      await postJson<{ saved: boolean }>(
        buildApiUrl("/pressure-extrapolation/recalculate/save"),
        {
          pad_id: event.pad_id,
          pozo_id: event.pozo_id,
          timestamp_evento: event.timestamp_evento,
          tipo_evento: event.tipo_evento,
          tp_horas: event.tp_horas ?? null,
          t_rel: keptIdxs.map((i) => fullTRel[i]),
          p_obs: keptIdxs.map((i) => fullPObs[i]),
          original_n_puntos: fullTRel.length,
          puntos_seleccionados: keptIdxs,
          params_exp: recalcData.params_exp,
          P_estimada_exp: recalcData.P_estimada_exp,
          R2_exp: recalcData.R2_exp,
          a_slog: recalcData.a_slog,
          b_slog: recalcData.b_slog,
          P_estimada_semilog: recalcData.P_estimada_semilog,
          R2_semilog: recalcData.R2_semilog,
          P_primer_dato: recalcData.P_primer_dato,
          delta_vs_primer_dato_exp: recalcData.delta_vs_primer_dato_exp,
          delta_vs_primer_dato_semilog: recalcData.delta_vs_primer_dato_semilog,
          P_estrella_horner: recalcData.P_estrella_horner ?? null,
          m_horner: recalcData.m_horner ?? null,
          R2_horner: recalcData.R2_horner ?? null,
        },
      );
      setSaveSuccess(true);
      setIsDirty(false);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaveLoading(false);
    }
  }

  function handleReset() {
    setIsDirty(false);
    setRecalcData(null);
    setRecalcError(null);
    setSaveError(null);
    setSaveSuccess(false);
    if (event.t_rel_original) {
      const selectedSet = new Set(event.puntos_seleccionados ?? []);
      setExcludedIdxs(
        new Set(event.t_rel_original.map((_, i) => i).filter((i) => !selectedSet.has(i))),
      );
    } else {
      setExcludedIdxs(new Set());
    }
  }

  const width = 980;
  const height = 400;
  const pad = { top: 28, right: 32, bottom: 56, left: 76 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const tMax = Math.max(...fullTRel, 0.1) * 1.05;
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

  const origEvent = event.resultados_originales;
  const origExpCurve =
    showOriginal && origEvent?.params_exp != null
      ? tFine.map((t) => origEvent.params_exp!.P_estable + origEvent.params_exp!.A * Math.exp(-origEvent.params_exp!.k * t))
      : null;
  const origSlogCurve =
    showOriginal && origEvent?.a_slog != null && origEvent?.b_slog != null
      ? tFine.map((t) => origEvent.a_slog! * Math.log(t + 0.5) + origEvent.b_slog!)
      : null;

  const allY = [
    ...fullPObs,
    ...(expCurve ?? []),
    ...(slogCurve ?? []),
    ...(origExpCurve ?? []),
    ...(origSlogCurve ?? []),
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

  const nLabel = recalcData
    ? `${recalcData.N_puntos}/${fullTRel.length}`
    : hasRecalcSaved
      ? `${remainingCount}/${fullTRel.length}`
      : String(fullTRel.length);

  return (
    <div className="chart">
      <div className="pba-fit-toolbar">
        <span className="pba-fit-title">
          {event.pozo_id} — apertura — {formatEventDate(event.timestamp_evento)} | N={nLabel} puntos
          {hasRecalcSaved && !isDirty && !recalcData && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#16a34a", fontWeight: 600 }}>
              recálculo guardado
            </span>
          )}
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isDirty && !recalcData && (
            <span style={{ fontSize: 12, color: remainingCount < 4 ? "#94a3b8" : "#ef4444" }}>
              {excludedIdxs.size} excluido{excludedIdxs.size !== 1 ? "s" : ""} — {remainingCount} restante{remainingCount !== 1 ? "s" : ""}
              {remainingCount < 4 ? " (mín. 4)" : ""}
            </span>
          )}
          {recalcData && !saveSuccess && (
            <span style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>Recalculado</span>
          )}
          {saveSuccess && (
            <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>Guardado</span>
          )}
          {hasRecalcSaved && (
            <button
              type="button"
              className={`pba-download-btn${showOriginal ? " pba-download-btn--active" : ""}`}
              onClick={() => setShowOriginal((v) => !v)}
            >
              {showOriginal ? "Ocultar original" : "Comparar con original"}
            </button>
          )}
          {hasChanges && (
            <button type="button" className="pba-download-btn" onClick={handleReset}>
              Restablecer
            </button>
          )}
          {isDirty && !recalcData && (
            <button
              type="button"
              className="pba-download-btn"
              onClick={handleRecalculate}
              disabled={!canRecalculate || recalcLoading}
            >
              {recalcLoading ? "Calculando…" : "Recalcular"}
            </button>
          )}
          {recalcData && (
            <button
              type="button"
              className="pba-save-btn"
              onClick={handleSave}
              disabled={saveLoading}
            >
              {saveLoading ? "Guardando…" : "Guardar cambios"}
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

      {(recalcError || saveError) && (
        <div className="upload__status upload__status--error" style={{ marginBottom: 8 }}>
          {recalcError ?? saveError}
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

        {/* Original pipeline curves (faded, for comparison) */}
        {origSlogCurve ? (
          <path d={buildPath(origSlogCurve)} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeDasharray="10 6" strokeLinecap="round" opacity={0.6} />
        ) : null}
        {origExpCurve ? (
          <path d={buildPath(origExpCurve)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" opacity={0.6} />
        ) : null}

        {/* Current fit curves */}
        {slogCurve ? (
          <path d={buildPath(slogCurve)} fill="none" stroke="#dc2626" strokeWidth="2.4" strokeDasharray="10 6" strokeLinecap="round" />
        ) : null}
        {expCurve ? (
          <path d={buildPath(expCurve)} fill="none" stroke="#1d4ed8" strokeWidth="2.6" strokeLinecap="round" />
        ) : null}

        {/* Data points — click to toggle inclusion */}
        {fullTRel.map((t, i) => {
          const excluded = excludedIdxs.has(i);
          return (
            <circle
              key={i}
              cx={xs(t)}
              cy={ys(fullPObs[i])}
              r="6"
              fill={excluded ? "#ef4444" : "#4a7fa5"}
              opacity={excluded ? 0.4 : 1}
              style={{ cursor: "pointer" }}
              onClick={() => togglePoint(i)}
            />
          );
        })}

        {/* P(t=0) markers — original (gray) */}
        {showOriginal && origEvent?.P_estimada_exp != null ? (
          <text x={x0 - 12} y={ys(origEvent.P_estimada_exp)} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize="18" fontWeight="bold" opacity={0.7}>
            ★
          </text>
        ) : null}
        {showOriginal && origEvent?.P_estimada_semilog != null ? (
          <text x={x0 + 12} y={ys(origEvent.P_estimada_semilog)} textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize="18" fontWeight="bold" opacity={0.7}>
            ★
          </text>
        ) : null}

        {/* P(t=0) markers — current */}
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
          {showOriginal && (origExpCurve || origSlogCurve) ? (
            <div className="chart__legend-item">
              <span style={{ width: 18, display: "inline-block", borderTop: "2px solid #94a3b8", marginTop: 6, opacity: 0.7 }} />
              <span style={{ color: "#94a3b8" }}>Pipeline original</span>
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
          {showOriginal && origEvent?.P_estimada_exp != null ? (
            <div className="pba-fit-metric">
              <span className="pba-fit-metric__star" style={{ color: "#94a3b8", opacity: 0.7 }}>★</span>
              <div>
                <strong style={{ color: "#94a3b8" }}>Original Exp = {origEvent.P_estimada_exp.toFixed(1)} psi</strong>
                <span>R² = {origEvent.R2_exp?.toFixed(3) ?? "—"}</span>
              </div>
            </div>
          ) : null}
          {showOriginal && origEvent?.P_estimada_semilog != null ? (
            <div className="pba-fit-metric">
              <span className="pba-fit-metric__star" style={{ color: "#94a3b8", opacity: 0.7 }}>★</span>
              <div>
                <strong style={{ color: "#94a3b8" }}>Original Slog = {origEvent.P_estimada_semilog.toFixed(1)} psi</strong>
                <span>R² = {origEvent.R2_semilog?.toFixed(3) ?? "—"}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
