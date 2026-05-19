import { useEffect, useMemo, useRef, useState } from "react";

type WellAnalysisRecord = {
  pad_id: string;
  pozo_id: string;
  timestamp: string;
  presion_boca_psi: number | null;
  presion_anular_psi: number | null;
  esta_abierto?: number;
  evento_apertura?: number;
  evento_cierre?: number;
  cambio_orificio?: number;
  purga_anular?: number;
  orificio_mm?: number | null;
  ratio_anular_vs_hidro?: number | null;
  P_hidro_boca_psi?: number | null;
};

type ExtrapolationEvent = {
  pozo_id: string;
  pad_id: string;
  timestamp_evento: string;
  tipo_evento: string;
  N_puntos: number;
  tp_horas: number | null;
  t_rel: number[];
  p_obs: number[];
  params_exp: { P_estable: number; A: number; k: number } | null;
  P_estimada_exp: number | null;
  R2_exp: number | null;
  a_slog: number | null;
  b_slog: number | null;
  P_estimada_semilog: number | null;
  R2_semilog: number | null;
  P_estrella_horner: number | null;
  m_horner: number | null;
  R2_horner: number | null;
  P_primer_dato: number;
  delta_vs_primer_dato_exp: number | null;
  delta_vs_primer_dato_semilog: number | null;
};

function cx(...items: Array<string | false | null | undefined>): string {
  return items.filter(Boolean).join(" ");
}

function formatEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const WELL_COLORS = [
  "#0f9a4c", "#0d6fd6", "#e07b00", "#9333ea", "#0891b2", "#be185d", "#059669", "#d97706",
];

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

function buildApiUrl(path: string, params?: Record<string, string>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";
  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return new URL(`${normalizedPath}${query}`, apiBaseUrl).toString();
  }
  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${normalizedBase}${normalizedPath}${query}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Error ${response.status} para ${url}`);
  return (await response.json()) as T;
}

function formatDT(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// ─── Overlay chart (todos los pozos del PAD) ───────────────────────────────

function OverlayChart({ data }: { data: WellAnalysisRecord[] }) {
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

// ─── Detail chart (un único pozo) ─────────────────────────────────────────

function WellDetailChart({ data }: { data: WellAnalysisRecord[] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [data],
  );

  const width = 980;
  const height = 480;
  const pad = { top: 32, right: 88, bottom: 100, left: 76 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const ts = sorted.map((r) => new Date(r.timestamp).getTime());
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);

  const yVals = sorted.filter((r) => r.presion_boca_psi != null).map((r) => r.presion_boca_psi!);
  const hidro = sorted.find((r) => r.P_hidro_boca_psi != null)?.P_hidro_boca_psi ?? null;
  const allLY = [...yVals, ...(hidro != null ? [hidro] : [])];
  const yMinL = Math.min(...allLY);
  const yMaxL = Math.max(...allLY);
  const yPdL = (yMaxL - yMinL) * 0.12 || 10;
  const dyL = [yMinL - yPdL, yMaxL + yPdL];

  const orVals = sorted
    .filter((r) => r.orificio_mm != null && isFinite(r.orificio_mm!))
    .map((r) => r.orificio_mm!);
  const hasOr = orVals.length > 0;
  const yMinR = hasOr ? Math.min(...orVals) : 0;
  const yMaxR = hasOr ? Math.max(...orVals) : 1;
  const yPdR = (yMaxR - yMinR) * 0.2 || 1;
  const dyR = [yMinR - yPdR, yMaxR + yPdR];

  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;
  const ysL = (v: number) => pad.top + (1 - (v - dyL[0]) / (dyL[1] - dyL[0] || 1)) * ch;
  const ysR = (v: number) => pad.top + (1 - (v - dyR[0]) / (dyR[1] - dyR[0] || 1)) * ch;

  const yTicksL = Array.from({ length: 5 }, (_, i) => dyL[0] + ((dyL[1] - dyL[0]) / 4) * i);
  const yTicksR = hasOr
    ? Array.from({ length: 5 }, (_, i) => dyR[0] + ((dyR[1] - dyR[0]) / 4) * i)
    : [];
  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) / 4) * i);

  // Pressure series path
  const prPts = sorted
    .filter((r) => r.presion_boca_psi != null)
    .map((r) => ({ t: new Date(r.timestamp).getTime(), v: r.presion_boca_psi! }));
  const prPath = prPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.t).toFixed(1)} ${ysL(p.v).toFixed(1)}`)
    .join(" ");

  // Orificio series path
  const orPts = hasOr
    ? sorted
        .filter((r) => r.orificio_mm != null && isFinite(r.orificio_mm!))
        .map((r) => ({ t: new Date(r.timestamp).getTime(), v: r.orificio_mm! }))
    : [];
  const orPath = orPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.t).toFixed(1)} ${ysR(p.v).toFixed(1)}`)
    .join(" ");

  // Background shading segments
  type Seg = { x1: number; x2: number; open: boolean };
  const segments: Seg[] = [];
  const hasEstado = sorted.some((r) => r.esta_abierto != null);
  if (hasEstado && sorted.length > 1) {
    let segT = new Date(sorted[0].timestamp).getTime();
    let segOpen = sorted[0].esta_abierto === 1;
    for (let i = 1; i < sorted.length; i++) {
      const currOpen = sorted[i].esta_abierto === 1;
      if (currOpen !== segOpen) {
        segments.push({ x1: segT, x2: new Date(sorted[i].timestamp).getTime(), open: segOpen });
        segT = new Date(sorted[i].timestamp).getTime();
        segOpen = currOpen;
      }
    }
    segments.push({ x1: segT, x2: new Date(sorted[sorted.length - 1].timestamp).getTime(), open: segOpen });
  }

  // Events
  const aperturas = sorted.filter((r) => r.evento_apertura === 1);
  const cierres = sorted.filter((r) => r.evento_cierre === 1);
  const cambios = sorted.filter((r) => r.cambio_orificio === 1);
  const purgas = sorted.filter((r) => r.purga_anular === 1);
  const hasEvents = aperturas.length > 0 || cierres.length > 0 || cambios.length > 0 || purgas.length > 0;

  // Fixed Y strip at bottom of chart for point-event markers
  const markerY = height - pad.bottom - 18;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Presión boca — detalle pozo">
        {/* Background shading */}
        {segments.map((seg, i) => (
          <rect
            key={i}
            x={xs(seg.x1)}
            y={pad.top}
            width={Math.max(xs(seg.x2) - xs(seg.x1), 0)}
            height={ch}
            fill={seg.open ? "#22c55e" : "#ef4444"}
            opacity={0.055}
          />
        ))}

        {/* Y grid (left) */}
        {yTicksL.map((tick) => {
          const y = ysL(tick);
          return (
            <g key={`yl-${tick}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(12,73,120,0.12)" strokeDasharray="6 10" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="chart__axis-label">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {/* Y ticks (right — orificio) */}
        {yTicksR.map((tick) => {
          const y = ysR(tick);
          return (
            <text key={`yr-${tick}`} x={width - pad.right + 10} y={y + 4} textAnchor="start" className="chart__axis-label" opacity="0.6">
              {tick.toFixed(1)}
            </text>
          );
        })}

        {/* X ticks */}
        {xTicks.map((tick) => {
          const x = xs(tick);
          return (
            <g key={`x-${tick}`}>
              <line x1={x} x2={x} y1={pad.top} y2={height - pad.bottom} stroke="rgba(12,73,120,0.1)" strokeDasharray="2 8" />
              <text x={x} y={height - pad.bottom + 16} textAnchor="middle" className="chart__axis-label">
                {formatDT(new Date(tick).toISOString())}
              </text>
            </g>
          );
        })}

        {/* Hydrostatic reference */}
        {hidro != null ? (
          <g>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={ysL(hidro)}
              y2={ysL(hidro)}
              stroke="#0891b2"
              strokeWidth="1.5"
              strokeDasharray="8 5"
              opacity="0.6"
            />
            <text x={width - pad.right + 4} y={ysL(hidro) - 5} textAnchor="start" className="chart__threshold" fill="#0891b2">
              P. hidro {Math.round(hidro)} psi
            </text>
          </g>
        ) : null}

        {/* Event vertical lines */}
        {aperturas.map((r, i) => (
          <line
            key={`ap-${i}`}
            x1={xs(new Date(r.timestamp).getTime())}
            x2={xs(new Date(r.timestamp).getTime())}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="#16a34a"
            strokeWidth="1.6"
            opacity="0.75"
          />
        ))}
        {cierres.map((r, i) => (
          <line
            key={`ci-${i}`}
            x1={xs(new Date(r.timestamp).getTime())}
            x2={xs(new Date(r.timestamp).getTime())}
            y1={pad.top}
            y2={height - pad.bottom}
            stroke="#c026d3"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            opacity="0.75"
          />
        ))}

        {/* Pressure line */}
        <path d={prPath} fill="none" stroke="#0f9a4c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />

        {/* Orificio line (right axis) */}
        {hasOr && orPath ? (
          <path d={orPath} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        ) : null}

        {/* Triangles: cambio orificio ▲ — fixed strip at bottom */}
        {cambios.map((r, i) => {
          const x = xs(new Date(r.timestamp).getTime());
          return (
            <polygon
              key={`co-${i}`}
              points={`${x},${markerY - 11} ${x - 7},${markerY + 2} ${x + 7},${markerY + 2}`}
              fill="#7c3aed"
              opacity="0.9"
            />
          );
        })}

        {/* Triangles: purga anular ▼ — fixed strip at bottom */}
        {purgas.map((r, i) => {
          const x = xs(new Date(r.timestamp).getTime());
          return (
            <polygon
              key={`pa-${i}`}
              points={`${x},${markerY + 11} ${x - 7},${markerY - 2} ${x + 7},${markerY - 2}`}
              fill="#ea580c"
              opacity="0.9"
            />
          );
        })}

        {/* Y axis labels (rotated text) */}
        <text
          x={18}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 18, ${pad.top + ch / 2})`}
        >
          Presión boca (psi)
        </text>
        {hasOr ? (
          <text
            x={width - 14}
            y={pad.top + ch / 2}
            textAnchor="middle"
            className="chart__axis-label"
            opacity="0.6"
            transform={`rotate(90, ${width - 14}, ${pad.top + ch / 2})`}
          >
            Orificio (mm)
          </text>
        ) : null}
      </svg>

      {/* Event + series legend */}
      <div className="chart__legend">
        <div className="chart__legend-item">
          <span className="chart__legend-swatch" style={{ background: "#0f9a4c" }} />
          <span>Presión boca (psi)</span>
        </div>
        {hasOr ? (
          <div className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: "#94a3b8" }} />
            <span>Orificio (mm)</span>
          </div>
        ) : null}
        {hidro != null ? (
          <div className="chart__legend-item">
            <span style={{ width: 18, display: "inline-block", borderTop: "2px dashed #0891b2", marginTop: 6 }} />
            <span>P. hidrostática</span>
          </div>
        ) : null}
        {hasEstado ? (
          <>
            <div className="chart__legend-item">
              <span style={{ width: 14, height: 10, display: "inline-block", background: "rgba(34,197,94,0.25)", border: "1px solid rgba(34,197,94,0.5)", borderRadius: 3 }} />
              <span>Abierto</span>
            </div>
            <div className="chart__legend-item">
              <span style={{ width: 14, height: 10, display: "inline-block", background: "rgba(239,68,68,0.2)", border: "1px solid rgba(239,68,68,0.45)", borderRadius: 3 }} />
              <span>Cerrado</span>
            </div>
          </>
        ) : null}
        {hasEvents ? (
          <>
            {aperturas.length > 0 ? (
              <div className="chart__legend-item">
                <span style={{ width: 18, display: "inline-block", borderTop: "2px solid #16a34a", marginTop: 6 }} />
                <span>Apertura</span>
              </div>
            ) : null}
            {cierres.length > 0 ? (
              <div className="chart__legend-item">
                <span style={{ width: 18, display: "inline-block", borderTop: "2px dashed #c026d3", marginTop: 6 }} />
                <span>Cierre</span>
              </div>
            ) : null}
            {cambios.length > 0 ? (
              <div className="chart__legend-item">
                <span style={{ width: 0, height: 0, display: "inline-block", borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderBottom: "12px solid #7c3aed" }} />
                <span>Cambio orificio</span>
              </div>
            ) : null}
            {purgas.length > 0 ? (
              <div className="chart__legend-item">
                <span style={{ width: 0, height: 0, display: "inline-block", borderLeft: "7px solid transparent", borderRight: "7px solid transparent", borderTop: "12px solid #ea580c" }} />
                <span>Purga anular</span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─── Extrapolation table ──────────────────────────────────────────────────

function ExtrapolationTable({
  events,
  selectedTs,
  onSelect,
}: {
  events: ExtrapolationEvent[];
  selectedTs: string | null;
  onSelect: (ts: string) => void;
}) {
  const aperturas = events
    .filter((e) => e.tipo_evento === "apertura")
    .sort((a, b) => a.timestamp_evento.localeCompare(b.timestamp_evento));

  if (aperturas.length === 0) {
    return <div className="loading-card">Sin eventos de apertura para este pozo.</div>;
  }

  const fmt = (v: number | null, digits: number) => (v == null ? "—" : v.toFixed(digits));

  const rows: Array<{ label: string; get: (e: ExtrapolationEvent) => string }> = [
    { label: "Puntos tomados", get: (e) => String(e.N_puntos) },
    { label: "P(t=0) Exponencial (psi)", get: (e) => fmt(e.P_estimada_exp, 1) },
    { label: "R² Exponencial", get: (e) => fmt(e.R2_exp, 3) },
    { label: "P(t=0) Semilog (psi)", get: (e) => fmt(e.P_estimada_semilog, 1) },
    { label: "R² Semilog", get: (e) => fmt(e.R2_semilog, 3) },
  ];

  return (
    <div className="extrap-table-wrap">
      <table className="extrap-table">
        <thead>
          <tr>
            <th className="extrap-table__stub">Métrica</th>
            {aperturas.map((e) => {
              const active = e.timestamp_evento === selectedTs;
              return (
                <th
                  key={e.timestamp_evento}
                  className={cx("extrap-table__event", active && "extrap-table__event--active")}
                >
                  <button
                    type="button"
                    className="extrap-table__button"
                    onClick={() => onSelect(e.timestamp_evento)}
                  >
                    <strong>{formatEventDate(e.timestamp_evento)}</strong>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, get }) => (
            <tr key={label}>
              <th scope="row" className="extrap-table__stub">
                {label}
              </th>
              {aperturas.map((e) => {
                const active = e.timestamp_evento === selectedTs;
                return (
                  <td key={`${e.timestamp_evento}-${label}`} className={cx(active && "extrap-table__cell--active")}>
                    {get(e)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Event fit chart ──────────────────────────────────────────────────────

function downloadSvg(svgEl: SVGSVGElement, filename: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const vb = svgEl.viewBox.baseVal;

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent =
    'text { font-family: "Segoe UI", system-ui, sans-serif; } ' +
    ".chart__axis-label { fill: rgba(63,91,116,0.92); font-size: 12px; } " +
    ".chart__threshold { fill: rgba(63,91,116,0.92); font-size: 11px; }";
  clone.insertBefore(style, clone.firstChild);

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("width", String(vb.width));
  bg.setAttribute("height", String(vb.height));
  bg.setAttribute("fill", "#f8fcff");
  clone.insertBefore(bg, clone.firstChild);

  clone.setAttribute("width", String(vb.width));
  clone.setAttribute("height", String(vb.height));

  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function EventFitChart({ event }: { event: ExtrapolationEvent }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 980;
  const height = 400;
  const pad = { top: 28, right: 32, bottom: 56, left: 76 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const tMax = Math.max(...event.t_rel, 0.1) * 1.05;
  const tMin = -tMax * 0.03;

  const N = 160;
  const tFine = Array.from({ length: N }, (_, i) => (i / (N - 1)) * tMax);

  const expCurve =
    event.params_exp != null
      ? tFine.map((t) => event.params_exp!.P_estable + event.params_exp!.A * Math.exp(-event.params_exp!.k * t))
      : null;

  const slogCurve =
    event.a_slog != null && event.b_slog != null
      ? tFine.map((t) => event.a_slog! * Math.log(t + 0.5) + event.b_slog!)
      : null;

  const allY = [
    ...event.p_obs,
    ...(expCurve ?? []),
    ...(slogCurve ?? []),
    ...(event.P_estimada_exp != null ? [event.P_estimada_exp] : []),
    ...(event.P_estimada_semilog != null ? [event.P_estimada_semilog] : []),
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
      {/* Toolbar: title + download button */}
      <div className="pba-fit-toolbar">
        <span className="pba-fit-title">
          {event.pozo_id} — apertura — {formatEventDate(event.timestamp_evento)} | N={event.N_puntos} puntos
        </span>
        <button
          type="button"
          className="pba-download-btn"
          onClick={() => svgRef.current && downloadSvg(svgRef.current, downloadFilename)}
        >
          ↓ SVG
        </button>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Ajuste de extrapolación — ${event.pozo_id}`}
      >
        {/* Y grid — solid, very light */}
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

        {/* X ticks — labels only, no vertical lines */}
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

        {/* Axis baseline */}
        <line x1={pad.left} x2={width - pad.right} y1={height - pad.bottom} y2={height - pad.bottom} stroke="rgba(12,73,120,0.2)" />
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={height - pad.bottom} stroke="rgba(12,73,120,0.2)" />

        {/* t=0 dotted reference */}
        <line x1={x0} x2={x0} y1={pad.top} y2={height - pad.bottom} stroke="rgba(63,91,116,0.22)" strokeDasharray="3 4" />

        {/* Semilog curve */}
        {slogCurve ? (
          <path d={buildPath(slogCurve)} fill="none" stroke="#dc2626" strokeWidth="2.4" strokeDasharray="10 6" strokeLinecap="round" />
        ) : null}

        {/* Exponential curve */}
        {expCurve ? (
          <path d={buildPath(expCurve)} fill="none" stroke="#1d4ed8" strokeWidth="2.6" strokeLinecap="round" />
        ) : null}

        {/* Observed scatter — solid filled, good size */}
        {event.t_rel.map((t, i) => (
          <circle key={i} cx={xs(t)} cy={ys(event.p_obs[i])} r="5" fill="#4a7fa5" />
        ))}

        {/* ★ at t=0 — exponential */}
        {event.P_estimada_exp != null ? (
          <text x={x0} y={ys(event.P_estimada_exp)} textAnchor="middle" dominantBaseline="middle" fill="#1d4ed8" fontSize="20" fontWeight="bold">
            ★
          </text>
        ) : null}

        {/* ★ at t=0 — semilog */}
        {event.P_estimada_semilog != null ? (
          <text x={x0} y={ys(event.P_estimada_semilog)} textAnchor="middle" dominantBaseline="middle" fill="#dc2626" fontSize="20" fontWeight="bold">
            ★
          </text>
        ) : null}

        {/* Axis labels */}
        <text x={pad.left + cw / 2} y={height - 8} textAnchor="middle" className="chart__axis-label" fontWeight="600">
          Tiempo relativo al evento (horas)
        </text>
        <text x={18} y={pad.top + ch / 2} textAnchor="middle" className="chart__axis-label" transform={`rotate(-90, 18, ${pad.top + ch / 2})`}>
          Presión boca (psi)
        </text>
      </svg>

      {/* Footer: legend + metrics panel side by side */}
      <div className="pba-fit-footer">
        <div className="chart__legend">
          <div className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: "#4a7fa5", borderRadius: "50%" }} />
            <span>Observado</span>
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
          {event.P_estimada_exp != null ? (
            <div className="pba-fit-metric">
              <span className="pba-fit-metric__star" style={{ color: "#1d4ed8" }}>★</span>
              <div>
                <strong>P(t=0) Exp = {event.P_estimada_exp.toFixed(1)} psi</strong>
                <span>R² = {event.R2_exp?.toFixed(3) ?? "—"}</span>
              </div>
            </div>
          ) : null}
          {event.P_estimada_semilog != null ? (
            <div className="pba-fit-metric">
              <span className="pba-fit-metric__star" style={{ color: "#dc2626" }}>★</span>
              <div>
                <strong>P(t=0) Slog = {event.P_estimada_semilog.toFixed(1)} psi</strong>
                <span>R² = {event.R2_semilog?.toFixed(3) ?? "—"}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────

export function PresionBocaAnalysis() {
  const [pads, setPads] = useState<string[]>([]);
  const [padsLoading, setPadsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allData, setAllData] = useState<WellAnalysisRecord[]>([]);
  const [selectedPad, setSelectedPad] = useState<string>("");
  const [selectedPozo, setSelectedPozo] = useState<string>("");
  const [extrapolaciones, setExtrapolaciones] = useState<ExtrapolationEvent[]>([]);
  const [extrapLoading, setExtrapLoading] = useState(false);
  const [selectedEventTs, setSelectedEventTs] = useState<string | null>(null);

  useEffect(() => {
    fetchJson<string[]>(buildApiUrl("/catalog/pads"))
      .then(setPads)
      .catch(() => setPads([]))
      .finally(() => setPadsLoading(false));
  }, []);

  useEffect(() => {
    setExtrapolaciones([]);
    setSelectedEventTs(null);
    if (!selectedPad || !selectedPozo) return;
    setExtrapLoading(true);
    fetchJson<ExtrapolationEvent[]>(
      buildApiUrl("/pressure-extrapolation/extrapolacion_eventos", {
        pad: selectedPad,
        pozo: selectedPozo,
      }),
    )
      .then(setExtrapolaciones)
      .catch(() => setExtrapolaciones([]))
      .finally(() => setExtrapLoading(false));
  }, [selectedPad, selectedPozo]);

  const pozos = useMemo(() => Array.from(new Set(allData.map((r) => r.pozo_id))).sort(), [allData]);

  const displayData = useMemo(
    () => (selectedPozo ? allData.filter((r) => r.pozo_id === selectedPozo) : allData),
    [allData, selectedPozo],
  );

  const handlePadChange = async (pad: string) => {
    setSelectedPad(pad);
    setSelectedPozo("");
    setAllData([]);
    setError(null);
    if (!pad) return;
    setLoading(true);
    try {
      const result = await fetchJson<WellAnalysisRecord[]>(
        buildApiUrl("/well-analysis/presion_boca", { pad }),
      );
      setAllData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const selectedEvent = useMemo(
    () => extrapolaciones.find((e) => e.timestamp_evento === selectedEventTs) ?? null,
    [extrapolaciones, selectedEventTs],
  );

  const hasData = !loading && selectedPad && allData.length > 0;

  return (
    <section className="pba-view">
      <div className="pba-filters">
        <div className="pba-filter">
          <label className="pba-filter__label" htmlFor="pba-pad">
            PAD
          </label>
          <select
            id="pba-pad"
            className="pba-select"
            value={selectedPad}
            onChange={(e) => handlePadChange(e.target.value)}
            disabled={padsLoading}
          >
            <option value="">{padsLoading ? "Cargando PADs…" : "Seleccioná un PAD"}</option>
            {pads.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="pba-filter">
          <label className="pba-filter__label" htmlFor="pba-pozo">
            Pozo
          </label>
          <select
            id="pba-pozo"
            className="pba-select"
            value={selectedPozo}
            onChange={(e) => setSelectedPozo(e.target.value)}
            disabled={!hasData}
          >
            <option value="">Todos los pozos</option>
            {pozos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="upload__status upload__status--error">{error}</div> : null}
      {loading ? <div className="loading-card">Cargando datos de presión…</div> : null}

      {hasData ? (
        <div className="pba-chart-panel">
          <div className="pba-chart-header">
            <div>
              <h3>{selectedPad}</h3>
              <p>
                {selectedPozo
                  ? `${selectedPozo} — ${displayData.length} registros`
                  : `${pozos.length} pozos — ${displayData.length} registros`}
              </p>
            </div>
          </div>

          {selectedPozo ? (
            <>
              <div className="pba-chart-section">
                <WellDetailChart data={displayData} />
              </div>

              <div className="pba-section-divider">
                <span>Extrapolación por apertura</span>
              </div>

              <div className="pba-chart-section">
                {extrapLoading ? (
                  <div className="loading-card">Cargando extrapolaciones…</div>
                ) : (
                  <>
                    <ExtrapolationTable
                      events={extrapolaciones}
                      selectedTs={selectedEventTs}
                      onSelect={(ts) => setSelectedEventTs((prev) => (prev === ts ? null : ts))}
                    />
                    {selectedEvent ? (
                      <div className="pba-chart-section pba-chart-section--inner">
                        <EventFitChart event={selectedEvent} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : (
            <OverlayChart data={displayData} />
          )}
        </div>
      ) : null}

      {!loading && !hasData && !error ? (
        <div className="loading-card">Seleccioná un PAD para cargar los datos.</div>
      ) : null}
    </section>
  );
}
