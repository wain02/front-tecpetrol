import { useMemo, useRef, useState } from "react";
import type { DensidadColumnaRecord } from "./types";
import { formatDT } from "./utils";

const INTERP_COLOR: Record<string, string> = {
  "Columna mayormente líquida": "#0d6fd6",
  "Columna mixta (gas + líquido)": "#e07b00",
  "Columna mayormente gaseosa": "#dc2626",
  "Dato inconsistente": "#94a3b8",
  "Sin dato": "#64748b",
};

const INTERP_LABELS = [
  "Columna mayormente líquida",
  "Columna mixta (gas + líquido)",
  "Columna mayormente gaseosa",
  "Sin dato",
] as const;

function interpColor(s: string): string {
  return INTERP_COLOR[s] ?? "#64748b";
}

// ─── 1. Métricas resumen ──────────────────────────────────────────────────────

function SummaryCards({ data }: { data: DensidadColumnaRecord[] }) {
  const stats = useMemo(() => {
    const valid = data.filter((d) => d.densidad_columna_kg_l != null);
    const avg =
      valid.length > 0
        ? valid.reduce((s, d) => s + d.densidad_columna_kg_l!, 0) / valid.length
        : null;
    const counts = new Map<string, number>();
    for (const d of data) counts.set(d.interpretacion, (counts.get(d.interpretacion) ?? 0) + 1);
    return { avg, validN: valid.length, counts };
  }, [data]);

  return (
    <div className="metric-strip metric-strip--2">
      <article className="metric-card">
        <span className="metric-card__label">Densidad promedio</span>
        <strong className="metric-card__value">
          {stats.avg != null ? `${stats.avg.toFixed(3)} kg/l` : "—"}
        </strong>
        <span className="metric-card__hint">
          {stats.validN} de {data.length} registros con dato
        </span>
      </article>
      <article className="metric-card">
        <span className="metric-card__label">Distribución de interpretaciones</span>
        <div style={{ marginTop: 8 }}>
          {INTERP_LABELS.map((label) => {
            const count = stats.counts.get(label) ?? 0;
            const pct = data.length > 0 ? Math.round((count / data.length) * 100) : 0;
            return (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background: interpColor(label),
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                <span style={{ fontSize: 11, color: "#93a9c9", flex: 1 }}>
                  {label.replace("Columna ", "")}
                </span>
                <strong style={{ fontSize: 13, color: interpColor(label) }}>{count}</strong>
                <span style={{ fontSize: 11, color: "#6b8aaa", minWidth: 40, textAlign: "right" }}>
                  ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

// ─── 2. Gráfico de densidad con zonas de color ────────────────────────────────

function DensityTimeChart({
  data,
  onRangeSelect,
}: {
  data: DensidadColumnaRecord[];
  onRangeSelect: (from: string, to: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ startX: number; currentX: number } | null>(null);

  const sorted = useMemo(
    () => [...data].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [data],
  );

  const width = 980;
  const height = 360;
  const pad = { top: 28, right: 96, bottom: 56, left: 72 };
  const cw = width - pad.left - pad.right;
  const ch = height - pad.top - pad.bottom;

  const ts = sorted.map((r) => new Date(r.timestamp).getTime());
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);

  const validDens = sorted
    .filter((r) => r.densidad_columna_kg_l != null)
    .map((r) => r.densidad_columna_kg_l!);
  const yMaxVal = Math.max(1.5, ...validDens) * 1.05;
  const yMinVal = 0;

  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;
  const ys = (v: number) => pad.top + (1 - (v - yMinVal) / (yMaxVal - yMinVal || 1)) * ch;

  const y09 = ys(0.9);
  const y05 = ys(0.5);
  const yBottom = pad.top + ch;

  const xTicks = Array.from({ length: 5 }, (_, i) => xMin + ((xMax - xMin) / 4) * i);
  const yTicks = Array.from({ length: 5 }, (_, i) => yMinVal + ((yMaxVal - yMinVal) / 4) * i);

  const densityPath = sorted
    .filter((r) => r.densidad_columna_kg_l != null)
    .map(
      (r, i) =>
        `${i === 0 ? "M" : "L"} ${xs(new Date(r.timestamp).getTime()).toFixed(1)} ${ys(r.densidad_columna_kg_l!).toFixed(1)}`,
    )
    .join(" ");

  const transitions = sorted.reduce<{ x: number; to: string }[]>((acc, r, i) => {
    if (i > 0 && r.interpretacion !== sorted[i - 1].interpretacion) {
      const xMid =
        (new Date(r.timestamp).getTime() + new Date(sorted[i - 1].timestamp).getTime()) / 2;
      acc.push({ x: xs(xMid), to: r.interpretacion });
    }
    return acc;
  }, []);

  const toSvgX = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const raw = ((e.clientX - rect.left) / rect.width) * width;
    return Math.max(pad.left, Math.min(width - pad.right, raw));
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const x = toSvgX(e);
    setDrag({ startX: x, currentX: x });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drag) return;
    setDrag((prev) => prev && { ...prev, currentX: toSvgX(e) });
  };

  const handleMouseUp = () => {
    if (!drag) return;
    const x1 = Math.min(drag.startX, drag.currentX);
    const x2 = Math.max(drag.startX, drag.currentX);
    if (x2 - x1 > 8) {
      const t1 = xMin + ((x1 - pad.left) / cw) * (xMax - xMin);
      const t2 = xMin + ((x2 - pad.left) / cw) * (xMax - xMin);
      onRangeSelect(
        new Date(t1).toISOString().slice(0, 10),
        new Date(t2).toISOString().slice(0, 10),
      );
    }
    setDrag(null);
  };

  return (
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Densidad de columna en el tiempo"
        style={{ cursor: "crosshair", userSelect: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrag(null)}
      >
        {/* Zonas de color */}
        <rect x={pad.left} y={pad.top} width={cw} height={Math.max(0, y09 - pad.top)} fill="rgba(13,111,214,0.07)" />
        <rect x={pad.left} y={y09} width={cw} height={Math.max(0, y05 - y09)} fill="rgba(224,123,0,0.07)" />
        <rect x={pad.left} y={y05} width={cw} height={Math.max(0, yBottom - y05)} fill="rgba(220,38,38,0.07)" />

        {/* Etiquetas de zona (derecha) */}
        <text x={width - pad.right + 6} y={Math.max(pad.top + 12, y09 - 8)} textAnchor="start" className="chart__threshold" fill="#0d6fd6">
          Líquida
        </text>
        <text x={width - pad.right + 6} y={y09 + (y05 - y09) / 2 + 4} textAnchor="start" className="chart__threshold" fill="#e07b00">
          Mixta
        </text>
        <text x={width - pad.right + 6} y={Math.min(yBottom - 6, y05 + 16)} textAnchor="start" className="chart__threshold" fill="#dc2626">
          Gaseosa
        </text>

        {/* Grid Y */}
        {yTicks.map((tick) => {
          const y = ys(tick);
          return (
            <g key={`y-${tick}`}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="rgba(12,73,120,0.09)" strokeDasharray="6 10" />
              <text x={pad.left - 10} y={y + 4} textAnchor="end" className="chart__axis-label">
                {tick.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Líneas de referencia 0.9 y 0.5 */}
        <line x1={pad.left} x2={width - pad.right} y1={y09} y2={y09} stroke="#0d6fd6" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.55" />
        <line x1={pad.left} x2={width - pad.right} y1={y05} y2={y05} stroke="#dc2626" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.55" />

        {/* Grid X */}
        {xTicks.map((tick) => {
          const x = xs(tick);
          return (
            <g key={`x-${tick}`}>
              <line x1={x} x2={x} y1={pad.top} y2={yBottom} stroke="rgba(12,73,120,0.08)" strokeDasharray="2 8" />
              <text x={x} y={height - pad.bottom + 16} textAnchor="middle" className="chart__axis-label">
                {formatDT(new Date(tick).toISOString())}
              </text>
            </g>
          );
        })}

        {/* Líneas verticales de cambio de estado */}
        {transitions.map((tr, i) => (
          <line
            key={i}
            x1={tr.x}
            x2={tr.x}
            y1={pad.top}
            y2={yBottom}
            stroke={interpColor(tr.to)}
            strokeWidth="1.5"
            strokeDasharray="3 5"
            opacity="0.65"
          />
        ))}

        {/* Línea de densidad */}
        {densityPath && (
          <path d={densityPath} fill="none" stroke="rgba(74,127,165,0.45)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Puntos coloreados por interpretación */}
        {sorted.map((r, i) => {
          if (r.densidad_columna_kg_l == null) return null;
          return (
            <circle
              key={i}
              cx={xs(new Date(r.timestamp).getTime())}
              cy={ys(r.densidad_columna_kg_l)}
              r={1.8}
              fill={interpColor(r.interpretacion)}
              opacity={0.75}
            />
          );
        })}

        {/* Eje Y */}
        <text
          x={18}
          y={pad.top + ch / 2}
          textAnchor="middle"
          className="chart__axis-label"
          transform={`rotate(-90, 18, ${pad.top + ch / 2})`}
        >
          Densidad (kg/l)
        </text>

        {/* Rectángulo de selección */}
        {drag && (
          <rect
            x={Math.min(drag.startX, drag.currentX)}
            y={pad.top}
            width={Math.abs(drag.currentX - drag.startX)}
            height={ch}
            fill="rgba(200,218,240,0.12)"
            stroke="rgba(200,218,240,0.55)"
            strokeWidth="1"
            pointerEvents="none"
          />
        )}
      </svg>

      <div className="chart__legend">
        {INTERP_LABELS.map((label) => (
          <div key={label} className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: interpColor(label), borderRadius: "50%" }} />
            <span>{label}</span>
          </div>
        ))}
        <div className="chart__legend-item">
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: 14,
              borderLeft: "1.5px dashed #93a9c9",
              marginRight: 4,
            }}
          />
          <span>Cambio de estado</span>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Timeline de interpretaciones ─────────────────────────────────────────
// Cada banda cubre el intervalo hasta el siguiente registro.
// El color indica el estado de la columna en ese momento.

function InterpretationTimeline({ data }: { data: DensidadColumnaRecord[] }) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [data],
  );

  const width = 980;
  const height = 68;
  const pad = { left: 72, right: 32, top: 8, bottom: 28 };
  const cw = width - pad.left - pad.right;
  const stripH = height - pad.top - pad.bottom;

  const ts = sorted.map((r) => new Date(r.timestamp).getTime());
  const xMin = Math.min(...ts);
  const xMax = Math.max(...ts);
  const xs = (t: number) => pad.left + ((t - xMin) / (xMax - xMin || 1)) * cw;

  return (
    <div className="chart" style={{ paddingBottom: 0 }}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Timeline de interpretaciones">
        {sorted.map((r, i) => {
          const x1 = xs(new Date(r.timestamp).getTime());
          const x2 =
            i < sorted.length - 1
              ? xs(new Date(sorted[i + 1].timestamp).getTime())
              : x1 + cw / sorted.length;
          return (
            <rect
              key={i}
              x={x1}
              y={pad.top}
              width={Math.max(1, x2 - x1)}
              height={stripH}
              fill={interpColor(r.interpretacion)}
              opacity={0.82}
            />
          );
        })}

        {[xMin, (xMin + xMax) / 2, xMax].map((tick, i) => (
          <text
            key={tick}
            x={xs(tick)}
            y={height - 4}
            textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            className="chart__axis-label"
          >
            {formatDT(new Date(tick).toISOString())}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ─── Date button ─────────────────────────────────────────────────────────────

function DateButton({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const display = value ? value.split("-").reverse().join("/") : label;

  return (
    <div style={{ display: "inline-block" }}>
      <button
        onClick={() => inputRef.current?.showPicker()}
        style={{
          fontSize: 11,
          padding: "4px 10px",
          background: value ? "#1e3a5f" : "#0f2744",
          color: value ? "#c8daf0" : "#6b8aaa",
          border: `1px solid ${value ? "#2d5a8e" : "#1e3a5f"}`,
          borderRadius: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
          userSelect: "none",
        }}
      >
        {display}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
      />
    </div>
  );
}

// ─── Export principal ─────────────────────────────────────────────────────────

export function DensidadColumnaPanel({ data }: { data: DensidadColumnaRecord[] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dateRange = useMemo(() => {
    if (data.length === 0) return { min: "", max: "" };
    const sorted = [...data].map((r) => r.timestamp).sort();
    return {
      min: sorted[0].slice(0, 10),
      max: sorted[sorted.length - 1].slice(0, 10),
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!dateFrom && !dateTo) return data;
    return data.filter((r) => {
      if (dateFrom && r.timestamp < dateFrom) return false;
      if (dateTo && r.timestamp > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [data, dateFrom, dateTo]);

  return (
    <div>
      <SummaryCards data={data} />

      <div style={{ marginTop: 20 }}>
        <div
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "#93a9c9" }}>
            Densidad de columna vs tiempo
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DateButton
              label="Fecha desde"
              value={dateFrom}
              min={dateRange.min}
              max={dateTo || dateRange.max}
              onChange={setDateFrom}
            />
            <DateButton
              label="Fecha hasta"
              value={dateTo}
              min={dateFrom || dateRange.min}
              max={dateRange.max}
              onChange={setDateTo}
            />
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  background: "transparent",
                  color: "#6b8aaa",
                  border: "1px solid #1e3a5f",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        <DensityTimeChart
          data={filtered}
          onRangeSelect={(from, to) => {
            setDateFrom(from);
            setDateTo(to);
          }}
        />
      </div>

      <div style={{ marginTop: 4 }}>
        <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: "#93a9c9" }}>
          Timeline de interpretaciones — cada banda es un registro, el color indica el estado de la columna
        </p>
        <InterpretationTimeline data={filtered} />
      </div>

    </div>
  );
}
