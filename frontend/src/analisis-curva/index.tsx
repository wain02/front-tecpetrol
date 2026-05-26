import { Component, useEffect, useMemo, useState } from "react";
import type { FirmaRecord, CicloResumen, CicloDetalle, CompareCurve } from "./types";
import { buildApiUrl, fetchJson, postJson } from "./api";
import { cx, formatDateTime, cycleDurationHours } from "./utils";
import { CycleDetailChart } from "./CycleDetailChart";
import { CompareChart } from "./CompareChart";
import { ClusterPanel } from "./ClusterPanel";
import type { ReactNode } from "react";

type ViewTab = "ciclos" | "firma";

// Catches render errors so a crash in one chart/panel doesn't blank the whole page
class CrashBoundary extends Component<{ children: ReactNode }, { crashed: boolean; msg: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { crashed: false, msg: "" };
  }
  static getDerivedStateFromError(err: unknown) {
    return { crashed: true, msg: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.crashed) {
      return (
        <div
          style={{
            padding: "24px",
            borderRadius: 16,
            background: "rgba(219,70,37,0.07)",
            border: "1px solid rgba(219,70,37,0.2)",
            color: "#8a2d1b",
            fontSize: "0.88rem",
          }}
        >
          Error al renderizar: {this.state.msg}
          <button
            style={{
              marginLeft: 14,
              border: "1px solid rgba(219,70,37,0.3)",
              borderRadius: 8,
              background: "transparent",
              color: "#8a2d1b",
              cursor: "pointer",
              padding: "3px 10px",
              fontSize: "0.82rem",
            }}
            onClick={() => this.setState({ crashed: false, msg: "" })}
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AnalisisCurva() {
  const [viewTab, setViewTab] = useState<ViewTab>("ciclos");

  // ── Firma global (Panel 1) ───────────────────────────────────────────────
  const [firmas, setFirmas] = useState<FirmaRecord[]>([]);
  const [compareCurves, setCompareCurves] = useState<CompareCurve[]>([]);
  const [firmasLoading, setFirmasLoading] = useState(true);

  // ── Panel 2 selectors ────────────────────────────────────────────────────
  const [pads, setPads] = useState<string[]>([]);
  const [padsLoading, setPadsLoading] = useState(true);
  const [selectedPad, setSelectedPad] = useState("");
  const [ciclos, setCiclos] = useState<CicloResumen[]>([]);
  const [ciclosLoading, setCiclosLoading] = useState(false);
  const [selectedPozo, setSelectedPozo] = useState("");
  const [selectedCiclo, setSelectedCiclo] = useState<CicloResumen | null>(null);
  const [cicloDetalle, setCicloDetalle] = useState<CicloDetalle | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  // ── Compare mode (Panel 3) ───────────────────────────────────────────────
  const [compareMode, setCompareMode] = useState(false);
  const [compPad, setCompPad] = useState("");
  const [compCiclos, setCompCiclos] = useState<CicloResumen[]>([]);
  const [compCiclosLoading, setCompCiclosLoading] = useState(false);
  const [compPozo, setCompPozo] = useState("");
  const [compCiclo, setCompCiclo] = useState<CicloResumen | null>(null);
  const [compDetalle, setCompDetalle] = useState<CicloDetalle | null>(null);
  const [compDetalleLoading, setCompDetalleLoading] = useState(false);
  const [compOverlay, setCompOverlay] = useState<CompareCurve[]>([]);
  const [overlayLoading, setOverlayLoading] = useState(false);

  // Load PADs on mount
  useEffect(() => {
    fetchJson<string[]>(buildApiUrl("/catalog/pads"))
      .then(setPads)
      .catch(() => setPads([]))
      .finally(() => setPadsLoading(false));
  }, []);

  // Load firma global on mount
  useEffect(() => {
    setFirmasLoading(true);
    fetchJson<FirmaRecord[]>(buildApiUrl("/curve-analysis/analisis_firmas/produccion"))
      .then((data) => {
        const arr = Array.isArray(data) ? data : [];
        if (!Array.isArray(data)) {
          console.warn("[AnalisisCurva] analisis_firmas/produccion no devolvió un array:", data);
        }
        setFirmas(arr);
      })
      .catch((err) => console.error("[AnalisisCurva] Error cargando firmas:", err))
      .finally(() => setFirmasLoading(false));
  }, []);

  // Once firmas are loaded, fetch normalized curves for ClusterPanel
  useEffect(() => {
    if (firmas.length === 0) return;
    const refs = firmas.map((f) => ({
      pad_id: f.pad_id,
      pozo_id: f.pozo_id,
      timestamp_apertura: f.t_inicio,
      timestamp_cierre: f.t_fin,
    }));
    postJson<CompareCurve[]>(buildApiUrl("/curve-analysis/ciclos/comparar"), refs)
      .then((curves) => setCompareCurves(Array.isArray(curves) ? curves : []))
      .catch((err) => console.warn("[AnalisisCurva] POST /ciclos/comparar falló:", err));
  }, [firmas]);

  // Derived: unique pozos for selected PAD
  const pozos = useMemo(() => [...new Set(ciclos.map((c) => c.pozo_id))].sort(), [ciclos]);
  const compPozos = useMemo(
    () => [...new Set(compCiclos.map((c) => c.pozo_id))].sort(),
    [compCiclos],
  );

  // Ciclos filtered by pozo
  const ciclosForPozo = useMemo(
    () => (selectedPozo ? ciclos.filter((c) => c.pozo_id === selectedPozo) : []),
    [ciclos, selectedPozo],
  );
  const compCiclosForPozo = useMemo(
    () => (compPozo ? compCiclos.filter((c) => c.pozo_id === compPozo) : []),
    [compCiclos, compPozo],
  );

  // Firma records for selected pad + pozo
  const firmasForPozo = useMemo(
    () => firmas.filter((f) => f.pad_id === selectedPad && f.pozo_id === selectedPozo),
    [firmas, selectedPad, selectedPozo],
  );

  // ── Handlers ────────────────────────────────────────────────────────────

  const handlePadChange = async (pad: string) => {
    setSelectedPad(pad);
    setSelectedPozo("");
    setSelectedCiclo(null);
    setCicloDetalle(null);
    setCiclos([]);
    setCompareMode(false);
    setCompDetalle(null);
    setCompOverlay([]);
    if (!pad) return;
    setCiclosLoading(true);
    try {
      const data = await fetchJson<CicloResumen[]>(
        buildApiUrl("/curve-analysis/ciclos", { pad }),
      );
      setCiclos(data);
      const first = [...new Set(data.map((c) => c.pozo_id))].sort()[0];
      if (first) setSelectedPozo(first);
    } catch {}
    finally {
      setCiclosLoading(false);
    }
  };

  const handleCicloChange = async (ciclo: CicloResumen | null) => {
    setSelectedCiclo(ciclo);
    setCicloDetalle(null);
    setCompareMode(false);
    setCompDetalle(null);
    setCompOverlay([]);
    if (!ciclo) return;
    setDetalleLoading(true);
    try {
      const det = await fetchJson<CicloDetalle>(
        buildApiUrl("/curve-analysis/ciclos/detalle", {
          pad: ciclo.pad_id,
          pozo: ciclo.pozo_id,
          timestamp_apertura: ciclo.timestamp_apertura,
          timestamp_cierre: ciclo.timestamp_cierre,
        }),
      );
      setCicloDetalle(det);
    } catch {}
    finally {
      setDetalleLoading(false);
    }
  };

  const handleCompPadChange = async (pad: string) => {
    setCompPad(pad);
    setCompPozo("");
    setCompCiclo(null);
    setCompDetalle(null);
    setCompOverlay([]);
    setCompCiclos([]);
    if (!pad) return;
    setCompCiclosLoading(true);
    try {
      const data = await fetchJson<CicloResumen[]>(
        buildApiUrl("/curve-analysis/ciclos", { pad }),
      );
      setCompCiclos(data);
      const first = [...new Set(data.map((c) => c.pozo_id))].sort()[0];
      if (first) setCompPozo(first);
    } catch {}
    finally {
      setCompCiclosLoading(false);
    }
  };

  const handleCompCicloChange = async (ciclo: CicloResumen | null) => {
    setCompCiclo(ciclo);
    setCompDetalle(null);
    setCompOverlay([]);
    if (!ciclo) return;

    setCompDetalleLoading(true);
    try {
      const det = await fetchJson<CicloDetalle>(
        buildApiUrl("/curve-analysis/ciclos/detalle", {
          pad: ciclo.pad_id,
          pozo: ciclo.pozo_id,
          timestamp_apertura: ciclo.timestamp_apertura,
          timestamp_cierre: ciclo.timestamp_cierre,
        }),
      );
      setCompDetalle(det);
    } catch {}
    finally {
      setCompDetalleLoading(false);
    }

    if (selectedCiclo) {
      setOverlayLoading(true);
      try {
        const refs = [
          {
            pad_id: selectedCiclo.pad_id,
            pozo_id: selectedCiclo.pozo_id,
            timestamp_apertura: selectedCiclo.timestamp_apertura,
            timestamp_cierre: selectedCiclo.timestamp_cierre,
          },
          {
            pad_id: ciclo.pad_id,
            pozo_id: ciclo.pozo_id,
            timestamp_apertura: ciclo.timestamp_apertura,
            timestamp_cierre: ciclo.timestamp_cierre,
          },
        ];
        const curves = await postJson<CompareCurve[]>(
          buildApiUrl("/curve-analysis/ciclos/comparar"),
          refs,
        );
        setCompOverlay(curves);
      } catch {}
      finally {
        setOverlayLoading(false);
      }
    }
  };

  const handleToggleCompare = () => {
    if (compareMode) {
      setCompareMode(false);
      setCompDetalle(null);
      setCompOverlay([]);
    } else {
      setCompareMode(true);
      if (selectedPad) handleCompPadChange(selectedPad);
    }
  };

  // Ciclo label shown in select options
  const cicloLabel = (c: CicloResumen) => {
    const dur = cycleDurationHours(c.timestamp_apertura, c.timestamp_cierre);
    return `${formatDateTime(c.timestamp_apertura)} → ${formatDateTime(c.timestamp_cierre)} (${Math.round(dur)}h)`;
  };

  return (
    <section className="ca-view">
      {/* View tabs */}
      <div className="ca-view-tabs">
        <button
          type="button"
          className={cx("ca-view-tab", viewTab === "ciclos" && "ca-view-tab--active")}
          onClick={() => setViewTab("ciclos")}
        >
          Análisis de ciclo
        </button>
        <button
          type="button"
          className={cx("ca-view-tab", viewTab === "firma" && "ca-view-tab--active")}
          onClick={() => setViewTab("firma")}
        >
          Firma global
        </button>
      </div>

      {viewTab === "firma" ? (
        <CrashBoundary>
          <ClusterPanel firmas={firmas} compareCurves={compareCurves} loading={firmasLoading} />
        </CrashBoundary>
      ) : (
        <>
          {/* ── Filter bar ────────────────────────────────────────────────── */}
          <div className="ca-bar">
            <div className="ca-bar__group">
              <label className="pba-filter__label">PAD</label>
              <select
                className="pba-select"
                value={selectedPad}
                onChange={(e) => handlePadChange(e.target.value)}
                disabled={padsLoading}
              >
                <option value="">{padsLoading ? "Cargando…" : "Seleccioná un PAD"}</option>
                {pads.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {pozos.length > 0 && (
              <div className="ca-bar__group">
                <label className="pba-filter__label">POZO</label>
                <div className="ca-pozo-tabs">
                  {pozos.map((pozo) => (
                    <button
                      key={pozo}
                      type="button"
                      className={cx("ca-pozo-tab", selectedPozo === pozo && "ca-pozo-tab--active")}
                      onClick={() => {
                        setSelectedPozo(pozo);
                        setSelectedCiclo(null);
                        setCicloDetalle(null);
                        setCompareMode(false);
                      }}
                    >
                      {pozo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ciclosForPozo.length > 0 && (
              <div className="ca-bar__group">
                <label className="pba-filter__label">CICLO</label>
                <select
                  className="pba-select"
                  style={{ minWidth: 360 }}
                  value={selectedCiclo?.timestamp_apertura ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      handleCicloChange(null);
                      return;
                    }
                    const found = ciclosForPozo.find((c) => c.timestamp_apertura === val);
                    if (found) handleCicloChange(found);
                  }}
                >
                  <option value="">Seleccioná un ciclo</option>
                  {ciclosForPozo.map((c) => (
                    <option key={c.timestamp_apertura} value={c.timestamp_apertura}>
                      {cicloLabel(c)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {cicloDetalle && (
              <button
                type="button"
                className={cx("ca-add-btn", compareMode && "ca-pozo-tab--active")}
                onClick={handleToggleCompare}
              >
                {compareMode ? "× Cancelar comparación" : "+ Comparar ciclo"}
              </button>
            )}
          </div>

          {/* ── Compare selectors ─────────────────────────────────────────── */}
          {compareMode && (
            <div className="ca-comp-picker">
              <div className="ca-bar__group">
                <label className="pba-filter__label">PAD (comparación)</label>
                <select
                  className="pba-select"
                  value={compPad}
                  onChange={(e) => handleCompPadChange(e.target.value)}
                  disabled={padsLoading}
                >
                  <option value="">Seleccioná un PAD</option>
                  {pads.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              {compPozos.length > 0 && (
                <div className="ca-bar__group">
                  <label className="pba-filter__label">POZO</label>
                  <div className="ca-pozo-tabs">
                    {compPozos.map((pozo) => (
                      <button
                        key={pozo}
                        type="button"
                        className={cx(
                          "ca-pozo-tab",
                          compPozo === pozo && "ca-pozo-tab--active",
                        )}
                        onClick={() => {
                          setCompPozo(pozo);
                          setCompCiclo(null);
                          setCompDetalle(null);
                          setCompOverlay([]);
                        }}
                      >
                        {pozo}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {compCiclosForPozo.length > 0 && (
                <div className="ca-bar__group">
                  <label className="pba-filter__label">CICLO (comparación)</label>
                  <select
                    className="pba-select"
                    style={{ minWidth: 360 }}
                    value={compCiclo?.timestamp_apertura ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        handleCompCicloChange(null);
                        return;
                      }
                      const found = compCiclosForPozo.find(
                        (c) => c.timestamp_apertura === val,
                      );
                      if (found) handleCompCicloChange(found);
                    }}
                  >
                    <option value="">Seleccioná un ciclo</option>
                    {compCiclosForPozo.map((c) => (
                      <option key={c.timestamp_apertura} value={c.timestamp_apertura}>
                        {cicloLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {compCiclosLoading && (
                <span style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                  Cargando ciclos…
                </span>
              )}
            </div>
          )}

          {/* ── Loading/empty states ─────────────────────────────────────── */}
          {ciclosLoading && <div className="loading-card">Cargando ciclos…</div>}
          {detalleLoading && <div className="loading-card">Cargando detalle del ciclo…</div>}

          {/* ── Cycle content ────────────────────────────────────────────── */}
          {cicloDetalle && !detalleLoading && (
            <CrashBoundary>
              <div className="ca-content">
                {compareMode ? (
                  <>
                    {/* Side-by-side charts */}
                    <div className={cx("ca-compare-grid", compDetalle && "ca-compare-grid--ready")}>
                      <div className="ca-section" style={{ padding: "16px 20px" }}>
                        <CycleHeader detalle={cicloDetalle} />
                        <CycleDetailChart detalle={cicloDetalle} compact />
                        <CycleKpis detalle={cicloDetalle} />
                      </div>

                      {compDetalle ? (
                        <div className="ca-section" style={{ padding: "16px 20px" }}>
                          <CycleHeader detalle={compDetalle} />
                          <CycleDetailChart detalle={compDetalle} compact />
                          <CycleKpis detalle={compDetalle} />
                        </div>
                      ) : compDetalleLoading ? (
                        <div className="loading-card" style={{ minHeight: 200 }}>
                          Cargando ciclo de comparación…
                        </div>
                      ) : (
                        <div
                          className="ca-section"
                          style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}
                        >
                          Seleccioná un ciclo para comparar
                        </div>
                      )}
                    </div>

                    {/* Normalized overlay */}
                    {compOverlay.length > 0 && (
                      <>
                        <div className="pba-section-divider">
                          <span>Comparación normalizada</span>
                        </div>
                        <div className="ca-section" style={{ padding: "16px 20px" }}>
                          {overlayLoading ? (
                            <div
                              style={{
                                padding: "24px",
                                textAlign: "center",
                                color: "var(--muted)",
                              }}
                            >
                              Cargando comparación…
                            </div>
                          ) : (
                            <CompareChart curves={compOverlay} />
                          )}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  /* Single cycle view */
                  <div className="ca-section">
                    <div style={{ padding: "18px 22px 10px" }}>
                      <CycleHeader detalle={cicloDetalle} />
                    </div>
                    <div style={{ padding: "0 22px 8px" }}>
                      <CycleDetailChart detalle={cicloDetalle} />
                    </div>
                    <CycleKpis detalle={cicloDetalle} />

                    {firmasForPozo.length > 0 && (
                      <>
                        <div className="pba-section-divider">
                          <span>Firma del pozo</span>
                        </div>
                        <FirmaKpis firmas={firmasForPozo} />
                      </>
                    )}
                  </div>
                )}
              </div>
            </CrashBoundary>
          )}

          {!ciclosLoading && !detalleLoading && !cicloDetalle && selectedPad && (
            <div className="loading-card">
              {selectedPozo
                ? ciclosForPozo.length === 0
                  ? "No hay ciclos disponibles para este pozo."
                  : "Seleccioná un ciclo para ver el detalle."
                : "Seleccioná un pozo."}
            </div>
          )}

          {!selectedPad && !padsLoading && (
            <div className="loading-card">Seleccioná un PAD para comenzar.</div>
          )}
        </>
      )}
    </section>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CycleHeader({ detalle }: { detalle: CicloDetalle }) {
  const dur = cycleDurationHours(detalle.timestamp_apertura, detalle.timestamp_cierre);
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: "1.02rem", letterSpacing: "-0.02em" }}>
        {detalle.pozo_id} · {detalle.pad_id}
      </div>
      <div style={{ color: "var(--muted)", fontSize: "0.86rem", marginTop: 2 }}>
        {formatDateTime(detalle.timestamp_apertura)} → {formatDateTime(detalle.timestamp_cierre)}
        {" · "}
        {Math.round(dur)}h · {detalle.n_registros} registros
      </div>
    </div>
  );
}

function CycleKpis({ detalle }: { detalle: CicloDetalle }) {
  const dur = cycleDurationHours(detalle.timestamp_apertura, detalle.timestamp_cierre);
  const e1 = detalle.features_etapa1;
  const er = detalle.features_resto;

  // Guard: API may return partial data
  if (!e1 || !er) return null;

  // Mini sparkline from etapa1 points
  const sparkPts = detalle.serie_temporal.slice(0, detalle.n_etapa1);
  const sparkVals = sparkPts.map((p) => p.presion_boca_psi);
  const sparkW = 72;
  const sparkH = 28;
  let sparkPath = "";
  if (sparkVals.length > 1) {
    const sMin = Math.min(...sparkVals);
    const sMax = Math.max(...sparkVals);
    sparkPath = sparkVals
      .map((v, i) => {
        const x = (i / (sparkVals.length - 1)) * sparkW;
        const y = sparkH - ((v - sMin) / (sMax - sMin || 1)) * sparkH;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <div className="metric-strip metric-strip--3" style={{ padding: "8px 22px 22px" }}>
      {/* APERTURA */}
      <div className="metric-card">
        <span className="metric-card__label">APERTURA</span>
        <span className="metric-card__value">{Math.round(detalle.P0)} psi</span>
        {detalle.orificio_apertura != null && (
          <span className="metric-card__hint">Orificio: {detalle.orificio_apertura.toFixed(1)} mm</span>
        )}
        <span className="metric-card__hint">
          P final: {Math.round(detalle.P_final)} psi
        </span>
      </div>

      {/* ETAPA 1 */}
      <div className="metric-card">
        <span className="metric-card__label">ETAPA 1</span>
        <span className="metric-card__value">
          {(e1.pendiente_inicial ?? 0) >= 0 ? "↑" : "↓"}{" "}
          {fmt(e1.pendiente_inicial != null ? Math.abs(e1.pendiente_inicial) : null, 2)} psi/reg
        </span>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 10,
          }}
        >
          <span className="metric-card__hint">
            σ {fmt(e1.volatilidad)} · rango {fmt(e1.rango_presion)} psi · acel.{" "}
            {fmt(e1.aceleracion, 2)}
          </span>
          {sparkPath && (
            <div className="ca-sparkline">
              <svg width={sparkW} height={sparkH} viewBox={`0 0 ${sparkW} ${sparkH}`}>
                <path d={sparkPath} fill="none" stroke="#0f9a4c" strokeWidth="1.8" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* CICLO COMPLETO */}
      <div className="metric-card">
        <span className="metric-card__label">CICLO COMPLETO</span>
        <span
          className="metric-card__value"
          style={{ color: (detalle.delta_P ?? 0) >= 0 ? "var(--accent)" : "var(--danger)" }}
        >
          {(detalle.delta_P ?? 0) >= 0 ? "+" : ""}
          {fmt(detalle.delta_P)} psi
        </span>
        <span className="metric-card__hint">
          {Math.round(detalle.P0)} → {Math.round(detalle.P_final)} psi · {Math.round(dur)}h
        </span>
        <span className="metric-card__hint">
          {er.pct_tiempo_bajo_p0 != null ? fmt(er.pct_tiempo_bajo_p0 * 100, 0) : "—"}% bajo P₀ · {er.n_cruces_p0 ?? "—"} cruces del nivel P₀
        </span>
      </div>
    </div>
  );
}

function FirmaKpis({ firmas }: { firmas: FirmaRecord[] }) {
  return (
    <div style={{ padding: "0 22px 22px" }}>
      <div className="extrap-tables">
        {firmas.map((f, i) => (
          <div key={i} className="extrap-card">
            <div className="extrap-card__head">
              <div>
                <h3>
                  {formatDateTime(f.t_inicio)} → {formatDateTime(f.t_fin)}
                </h3>
                <p>
                  Cluster {f.cluster} ·{" "}
                  <strong style={{ color: "var(--text)" }}>{Math.round(f.duracion_horas)}h</strong>
                </p>
              </div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: "0.82rem",
                  fontWeight: 700,
                  background: "rgba(15,154,76,0.1)",
                  border: "1px solid rgba(15,154,76,0.25)",
                  color: "#0f6a38",
                }}
              >
                Cluster {f.cluster}
              </div>
            </div>
            <div className="metric-strip">
              <div className="metric-card">
                <span className="metric-card__label">P media</span>
                <span className="metric-card__value">{fmt(f.p_media)} psi</span>
                <span className="metric-card__hint">σ = {fmt(f.p_std, 2)}</span>
              </div>
              <div className="metric-card">
                <span className="metric-card__label">Delta total</span>
                <span className="metric-card__value">{fmt(f.delta_total)} psi</span>
                <span className="metric-card__hint">CV = {fmt(f.p_cv, 3)}</span>
              </div>
              <div className="metric-card">
                <span className="metric-card__label">Pendiente inicial</span>
                <span className="metric-card__value">{fmt(f.pendiente_inicial, 3)}</span>
                <span className="metric-card__hint">R² exp = {fmt(f.r2_exponencial, 3)}</span>
              </div>
              <div className="metric-card">
                <span className="metric-card__label">Picos / oscilaciones</span>
                <span className="metric-card__value">{f.n_picos_total ?? "—"}</span>
                <span className="metric-card__hint">Oscilaciones: {f.n_oscilaciones ?? "—"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(v: number | null | undefined, dec = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(dec);
}
