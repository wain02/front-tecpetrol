import { useMemo, useRef, useState } from "react";
import type { WellAnalysisRecord } from "./types";
import { formatDT } from "./utils";

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

export function WellDetailChart({ data }: { data: WellAnalysisRecord[] }) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const dateRange = useMemo(() => {
    if (data.length === 0) return { min: "", max: "" };
    const ts = [...data].map((r) => r.timestamp).sort();
    return { min: ts[0].slice(0, 10), max: ts[ts.length - 1].slice(0, 10) };
  }, [data]);

  const filtered = useMemo(() => {
    if (!dateFrom && !dateTo) return data;
    return data.filter((r) => {
      if (dateFrom && r.timestamp < dateFrom) return false;
      if (dateTo && r.timestamp > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [data, dateFrom, dateTo]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [filtered],
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

  const prPts = sorted
    .filter((r) => r.presion_boca_psi != null)
    .map((r) => ({ t: new Date(r.timestamp).getTime(), v: r.presion_boca_psi! }));
  const prPath = prPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.t).toFixed(1)} ${ysL(p.v).toFixed(1)}`)
    .join(" ");

  const orPts = hasOr
    ? sorted
        .filter((r) => r.orificio_mm != null && isFinite(r.orificio_mm!))
        .map((r) => ({ t: new Date(r.timestamp).getTime(), v: r.orificio_mm! }))
    : [];
  const orPath = orPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xs(p.t).toFixed(1)} ${ysR(p.v).toFixed(1)}`)
    .join(" ");

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

  const aperturas = sorted.filter((r) => r.evento_apertura === 1);
  const cierres = sorted.filter((r) => r.evento_cierre === 1);
  const cambios = sorted.filter((r) => r.cambio_orificio === 1);
  const purgas = sorted.filter((r) => r.purga_anular === 1);
  const hasEvents = aperturas.length > 0 || cierres.length > 0 || cambios.length > 0 || purgas.length > 0;

  const markerY = height - pad.bottom - 18;

  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ startX: number; currentX: number } | null>(null);

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
      setDateFrom(new Date(t1).toISOString().slice(0, 10));
      setDateTo(new Date(t2).toISOString().slice(0, 10));
    }
    setDrag(null);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 8 }}>
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
            onClick={() => { setDateFrom(""); setDateTo(""); }}
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
    <div className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Presión boca — detalle pozo"
        style={{ cursor: "crosshair", userSelect: "none" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDrag(null)}
      >
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

        {yTicksR.map((tick) => {
          const y = ysR(tick);
          return (
            <text key={`yr-${tick}`} x={width - pad.right + 10} y={y + 4} textAnchor="start" className="chart__axis-label" opacity="0.6">
              {tick.toFixed(1)}
            </text>
          );
        })}

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

        <path d={prPath} fill="none" stroke="#0f9a4c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />

        {hasOr && orPath ? (
          <path d={orPath} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        ) : null}

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
    </div>
  );
}
