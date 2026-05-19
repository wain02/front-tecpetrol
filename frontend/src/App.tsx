import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./lib/supabase";
import tecpetrolLogo from "../logos/logo-tecpe.png";
import { PresionBocaAnalysis } from "./PresionBocaAnalysis";

type PredictionRow = {
  date: string;
  actual_gor: number;
  baseline_pred: number;
  rf_pred: number;
};

type ImportanceRow = {
  feature: string;
  importance: number;
};

type TrainedModel = {
  label: string;
  status: "trained";
  cv_rmse: number;
  train: number;
  metrics: {
    model: string;
    RMSE: number;
    MAE: number;
    R2: number;
  };
  best_params: Record<string, string | number | null>;
  prediction_preview: PredictionRow[];
  importance: ImportanceRow[];
};

type PendingModel = {
  label: string;
  status: "pending_dependency";
  note: string;
};

type ModelReport = TrainedModel | PendingModel;

type ReportData = {
  project: {
    title: string;
    subtitle: string;
  };
  dataset: {
    rows: number;
    trainable_rows: number;
    gor_coverage: number;
    gor_mean: number;
    gor_median: number;
    gor_std: number;
    wor_mean: number;
    wor_std: number;
    date_min: string;
    date_max: string;
    feature_count: number;
    well_count: number;
  };
  gor_stats: {
    count: number;
    mean: number;
    std: number;
    min: number;
    p25: number;
    p50: number;
    p75: number;
    max: number;
    iqr: number;
    lower_fence: number;
    upper_fence: number;
    n_outliers: number;
    pct_outliers: string;
    n_gas_dominante: number;
    n_mixto: number;
    n_liquido_dominante: number;
  };
  regime_thresholds: {
    liquid: number;
    gas: number;
  };
  models: {
    baseline: TrainedModel;
    rf: TrainedModel;
    xgb: PendingModel;
  };
  feature_names: string[];
  narrative: string[];
  production_series: Array<{
    date: string;
    gas_m3_hora: number;
    liquid_m3_hora: number;
    gas_to_liquid_ratio: number;
  }>;
  production_summary: {
    gas_mean: number;
    liquid_mean: number;
    ratio_mean: number;
    ratio_max: number;
  };
  gor_series: Array<{
    date: string;
    gor_m3_m3: number;
  }>;
  gor_histogram: Array<{
    left: number;
    right: number;
    count: number;
  }>;
  correlations_top: Array<{
    feature: string;
    pearson_r: number;
    spearman_r: number;
    mutual_info: number;
  }>;
};

type ModelKey = "baseline" | "rf" | "xgb";

const colors = {
  bg: "#07111f",
  panel: "#0d1727",
  panelAlt: "#12243a",
  text: "#e9f2ff",
  muted: "#93a9c9",
  line: "#20324d",
  accent: "#f6b73c",
  accent2: "#47d1c7",
  danger: "#ef6b53",
  blue: "#7cb7ff",
};

type ExtrapolacionEvento = {
  pad_id: string;
  pozo_id: string;
  timestamp_evento: string;
  tipo_evento: string;
  N_puntos: number;
  tp_horas: number | null;
  P_primer_dato: number;
  P_estimada_exp: number;
  R2_exp: number;
  params_exp: {
    P_estable: number;
    A: number;
    k: number;
  };
  P_estimada_semilog: number;
  R2_semilog: number;
  P_estrella_horner: number | null;
  m_horner: number | null;
  R2_horner: number | null;
  delta_vs_primer_dato_exp: number;
  delta_vs_primer_dato_semilog: number;
  t_rel?: number[];
  p_obs?: number[];
  a_slog?: number | null;
  b_slog?: number | null;
};

type ExtrapolationGroup = {
  key: string;
  rows: ExtrapolacionEvento[];
  best: ExtrapolacionEvento;
  score: number;
  label: string;
};

type AnalisisFirma = {
  pad_id: string;
  pozo_id: string;
  t_inicio: string;
  t_fin: string;
  tipo_segmento: string;
  duracion_horas: number;
  p_media: number;
  p_std: number;
  p_rango: number;
  delta_total: number;
  tasa_cambio_media: number;
  r2_lineal: number;
  r2_exponencial: number;
  n_picos_total: number;
  n_oscilaciones: number;
  cluster: number | null;
};

type PresionT0Pad = {
  pad_id: string;
  pozo_id: string;
  t_cero_pad: string;
  t_primera_apertura: string | null;
  horas_buildup_inicial: number | null;
  n_puntos_cerrado: number;
  P_t0_medido: number;
  P_t0_lineal: number | null;
  R2_lineal: number | null;
  P_pre_apertura: number | null;
  P_fondo_metadata_cercana: number | null;
  notas: string;
};

type PresionBoca = {
  pad_id: string;
  pozo_id: string;
  timestamp: string;
  presion_boca_psi: number | null;
  presion_anular_psi: number | null;
  P_hidro_boca_psi: number | null;
};

type PresionFondo = {
  pad_id: string;
  pozo_id: string;
  fecha_medicion: string;
  presion_psia: number;
  P_hidro_fondo_psia: number | null;
};

type PreviewPayload = {
  sheets: string[];
  header_rows_detected: number;
  columns: string[];
  sample_rows: Array<Record<string, string>>;
};

type PreviewResponse = {
  preview_id: string;
  datos: PreviewPayload;
  metadata: PreviewPayload;
};


function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function classNames(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(" ");
}

function parseXlsxHeaders(buffer: ArrayBuffer): string[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const worksheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, blankrows: false });
  const headerRow = rows[0] ?? [];
  return headerRow.map((cell) => String(cell).trim()).filter((cell) => cell.length > 0);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch error ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";

function apiUrl(path: string, params?: Record<string, string>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const query = params ? `?${new URLSearchParams(params).toString()}` : "";

  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return new URL(`${normalizedPath}${query}`, apiBaseUrl).toString();
  }

  const normalizedBase = apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  return `${normalizedBase}${normalizedPath}${query}`;
}

function fillMissing(values: Array<number | null | undefined>): number[] {
  let lastValue = 0;
  return values.map((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      lastValue = value;
      return value;
    }
    return lastValue;
  });
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function fitSemilog(points: Array<{ x: number; y: number }>): { a: number; b: number; r2: number } | null {
  const filtered = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (filtered.length < 2) return null;

  const xs = filtered.map((point) => Math.log(Math.max(point.x, 0) + 0.5));
  const ys = filtered.map((point) => point.y);
  const n = filtered.length;
  const sumX = xs.reduce((sum, value) => sum + value, 0);
  const sumY = ys.reduce((sum, value) => sum + value, 0);
  const sumXX = xs.reduce((sum, value) => sum + value * value, 0);
  const sumXY = xs.reduce((sum, value, index) => sum + value * ys[index], 0);
  const denominator = n * sumXX - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) return null;

  const a = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - a * sumX) / n;
  const predicted = xs.map((x) => a * x + b);
  const yMean = mean(ys);
  const ssTot = ys.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
  const ssRes = ys.reduce((sum, value, index) => sum + (value - predicted[index]) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  return { a, b, r2 };
}

function formatEventLabel(event: ExtrapolacionEvento): string {
  return `${event.pozo_id} ${event.tipo_evento} ${formatDateTime(event.timestamp_evento)}`;
}

function buildEventKey(event: Pick<ExtrapolacionEvento, "pozo_id" | "timestamp_evento" | "tipo_evento">): string {
  return `${event.pozo_id}-${event.timestamp_evento}-${event.tipo_evento}`;
}

function getPressureValue(row: PresionBoca): number | null {
  return row.presion_boca_psi ?? row.presion_anular_psi ?? row.P_hidro_boca_psi ?? null;
}

function buildPressureSeriesForEvent(
  event: ExtrapolacionEvento,
  bocaByPozo: Array<{ pozo: string; items: PresionBoca[] }>,
): Array<{ x: number; y: number }> {
  const source = bocaByPozo.find((item) => item.pozo === event.pozo_id)?.items ?? [];
  if (source.length === 0) return [];

  const start = new Date(event.timestamp_evento).getTime();
  const targetCount = Math.max(event.N_puntos, 12);

  return source
    .filter((row) => new Date(row.timestamp).getTime() >= start)
    .slice(0, targetCount)
    .map((row) => {
      const value = getPressureValue(row);
      return {
        x: Math.max((new Date(row.timestamp).getTime() - start) / 3_600_000, 0),
        y: value ?? 0,
      };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function selectBestWindow(rows: ExtrapolacionEvento[]): ExtrapolacionEvento {
  return [...rows].sort((a, b) => {
    const scoreA = mean([a.R2_exp, a.R2_semilog].filter(isFiniteNumber));
    const scoreB = mean([b.R2_exp, b.R2_semilog].filter(isFiniteNumber));
    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.N_puntos - b.N_puntos;
  })[0];
}

function buildCurvePoints(row: ExtrapolacionEvento, sourcePoints: Array<{ x: number; y: number }>, sampleCount = 120) {
  const xs = sourcePoints.map((point) => point.x).filter((value) => Number.isFinite(value));
  const minX = Math.min(0, ...xs);
  const maxX = Math.max(...xs, row.tp_horas ?? 0);
  const span = Math.max(maxX - minX, 1);
  const step = span / Math.max(sampleCount - 1, 1);

  return Array.from({ length: sampleCount }, (_, index) => {
    const x = minX + index * step;
    return {
      x,
      exp: row.params_exp.P_estable + row.params_exp.A * Math.exp(-row.params_exp.k * Math.max(x, 0)),
      semilog: row.a_slog != null && row.b_slog != null ? row.a_slog * Math.log(Math.max(x, 0) + 0.5) + row.b_slog : null,
    };
  });
}

function buildHornerPoints(row: ExtrapolacionEvento, sourcePoints: Array<{ x: number; y: number }>) {
  if (row.tp_horas == null || row.P_estrella_horner == null || row.m_horner == null) return null;
  const points = sourcePoints
    .filter((point) => point.x > 0)
    .map((point) => ({
      x: Math.log10((row.tp_horas! + point.x) / point.x),
      y: point.y,
    }));
  if (points.length === 0) return null;

  const xs = points.map((point) => point.x);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs);
  const line = Array.from({ length: 80 }, (_, index) => {
    const x = minX + ((maxX - minX) * index) / 79;
    return {
      x,
      y: row.P_estrella_horner! - row.m_horner! * x,
    };
  });

  return {
    points,
    line,
    star: { x: 0, y: row.P_estrella_horner },
  };
}


function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "accent" | "success" | "danger";
}) {
  return (
    <article className={classNames("metric-card", `metric-card--${tone}`)}>
      <span className="metric-card__label">{label}</span>
      <strong className="metric-card__value">{value}</strong>
      <span className="metric-card__hint">{hint}</span>
    </article>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "success" | "danger" }) {
  return <span className={classNames("chip", `chip--${tone}`)}>{children}</span>;
}

function Panel({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={classNames("panel", className)}>
      <div className="panel__head">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function LineChart({
  labels,
  series,
  thresholds,
  ariaLabel = "Gráfico de líneas",
}: {
  labels: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  thresholds?: Array<{ label: string; value: number; color: string }>;
  ariaLabel?: string;
}) {
  const width = 980;
  const height = 380;
  const padding = { top: 24, right: 24, bottom: 54, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const allValues = series.flatMap((item) => item.values);
  const thresholdValues = thresholds?.map((item) => item.value) ?? [];
  const min = Math.min(...allValues, ...thresholdValues);
  const max = Math.max(...allValues, ...thresholdValues);
  const yMin = min - Math.abs(max - min) * 0.08;
  const yMax = max + Math.abs(max - min) * 0.08;
  const xStep = labels.length > 1 ? chartWidth / (labels.length - 1) : chartWidth;
  const yScale = (value: number) => padding.top + (1 - (value - yMin) / (yMax - yMin || 1)) * chartHeight;

  const buildPath = (values: number[]): string =>
    values
      .map((value, index) => {
        const x = padding.left + index * xStep;
        const y = yScale(value);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) / 4) * index);
  const labelIndices = [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter((value, index, self) => self.indexOf(value) === index);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <defs>
          <linearGradient id="chartGlow" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.accent2} stopOpacity="0.28" />
            <stop offset="100%" stopColor={colors.accent2} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={colors.line} strokeDasharray="6 10" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="chart__axis-label">
                {formatNumber(tick, 0)}
              </text>
            </g>
          );
        })}

        {thresholds?.map((threshold) => {
          const y = yScale(threshold.value);
          return (
            <g key={threshold.label}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={threshold.color} strokeDasharray="4 8" />
              <text x={width - padding.right} y={y - 8} textAnchor="end" className="chart__threshold">
                {threshold.label}
              </text>
            </g>
          );
        })}

        {labelIndices.map((index) => {
          const x = padding.left + index * xStep;
          return (
            <g key={labels[index]}>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke={colors.line} strokeDasharray="2 8" opacity="0.5" />
              <text x={x} y={height - 14} textAnchor="middle" className="chart__axis-label">
                {labels[index]}
              </text>
            </g>
          );
        })}

        {series.map((item, index) => {
          const path = buildPath(item.values);
          const fill = index === 0 ? `url(#chartGlow)` : "none";
          return (
            <g key={item.name}>
              <path d={`${path} L ${padding.left + (labels.length - 1) * xStep} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`} fill={fill} />
              <path d={path} fill="none" stroke={item.color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
              {item.values.map((value, pointIndex) => {
                const x = padding.left + pointIndex * xStep;
                const y = yScale(value);
                return <circle key={`${item.name}-${pointIndex}`} cx={x} cy={y} r="2.8" fill={item.color} opacity="0.8" />;
              })}
            </g>
          );
        })}
      </svg>

      <div className="chart__legend">
        {series.map((item) => (
          <div key={item.name} className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: item.color }} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistogramChart({
  bins,
  thresholds,
  ariaLabel = "Histograma",
}: {
  bins: Array<{ left: number; right: number; count: number }>;
  thresholds?: Array<{ label: string; value: number; color: string }>;
  ariaLabel?: string;
}) {
  const width = 980;
  const height = 320;
  const padding = { top: 24, right: 24, bottom: 52, left: 54 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
  const barWidth = chartWidth / bins.length;
  const minX = bins[0]?.left ?? 0;
  const maxX = bins[bins.length - 1]?.right ?? 1;
  const xScale = (value: number) => padding.left + ((value - minX) / (maxX - minX || 1)) * chartWidth;
  const yScale = (value: number) => padding.top + (1 - value / maxCount) * chartHeight;
  const yTicks = Array.from({ length: 5 }, (_, index) => (maxCount / 4) * index);
  const labelIndices = [0, Math.floor((bins.length - 1) / 2), bins.length - 1].filter((value, index, self) => self.indexOf(value) === index);

  return (
    <div className="chart chart--compact">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={colors.line} strokeDasharray="6 10" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="chart__axis-label">
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {thresholds?.map((threshold) => {
          const x = xScale(threshold.value);
          return (
            <g key={threshold.label}>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke={threshold.color} strokeDasharray="4 8" />
              <text x={x + 6} y={padding.top + 12} textAnchor="start" className="chart__threshold">
                {threshold.label}
              </text>
            </g>
          );
        })}

        {bins.map((bin, index) => {
          const h = Math.max((bin.count / maxCount) * chartHeight, 2);
          const x = padding.left + index * barWidth + 3;
          const y = padding.top + chartHeight - h;
          const fill = bin.right <= 100 ? colors.blue : bin.left >= 500 ? colors.danger : colors.accent;
          return <rect key={`${bin.left}-${bin.right}`} x={x} y={y} width={Math.max(barWidth - 6, 4)} height={h} rx="4" fill={fill} opacity="0.9" />;
        })}

        {labelIndices.map((index) => {
          const bin = bins[index];
          const x = padding.left + index * barWidth + barWidth / 2;
          return (
            <text key={`${bin.left}-${bin.right}-label`} x={x} y={height - 14} textAnchor="middle" className="chart__axis-label">
              {formatNumber(bin.left, 0)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function HorizontalBarChart({
  items,
  ariaLabel = "Ranking horizontal",
}: {
  items: Array<{ label: string; value: number }>;
  ariaLabel?: string;
}) {
  const width = 980;
  const height = 420;
  const padding = { top: 20, right: 24, bottom: 24, left: 230 };
  const chartWidth = width - padding.left - padding.right;
  const rowHeight = (height - padding.top - padding.bottom) / items.length;
  const maxValue = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  const midX = padding.left + chartWidth / 2;

  return (
    <div className="chart chart--ranking">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        <line x1={midX} x2={midX} y1={padding.top} y2={height - padding.bottom} stroke={colors.line} strokeDasharray="6 8" />
        {items.map((item, index) => {
          const y = padding.top + index * rowHeight + rowHeight * 0.18;
          const barHeight = rowHeight * 0.62;
          const barWidth = (Math.abs(item.value) / maxValue) * (chartWidth / 2);
          const x = item.value >= 0 ? midX : midX - barWidth;
          const fill = item.value >= 0 ? colors.danger : colors.blue;
          return (
            <g key={item.label}>
              <text x={padding.left - 12} y={y + barHeight * 0.72} textAnchor="end" className="chart__label-left">
                {item.label}
              </text>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="6" fill={fill} opacity="0.9" />
              <text x={item.value >= 0 ? x + barWidth + 8 : x - 8} y={y + barHeight * 0.72} textAnchor={item.value >= 0 ? "start" : "end"} className="chart__axis-label">
                {item.value.toFixed(3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BarList({
  items,
}: {
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...items.map((item) => Math.abs(item.value)), 1);

  return (
    <div className="bar-list">
      {items.map((item) => {
        const width = (Math.abs(item.value) / max) * 100;
        const positive = item.value >= 0;
        return (
          <div key={item.label} className="bar-list__row">
            <div className="bar-list__meta">
              <span className="bar-list__label">{item.label}</span>
              <span className="bar-list__value">{formatNumber(item.value, 3)}</span>
            </div>
            <div className="bar-list__track" aria-hidden="true">
              <div
                className={classNames("bar-list__fill", positive ? "bar-list__fill--positive" : "bar-list__fill--negative")}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

type XYSeries = {
  name: string;
  color: string;
  points: Array<{ x: number; y: number }>;
  strokeDasharray?: string;
  showPoints?: boolean;
  strokeWidth?: number;
  pointRadius?: number;
};

type XYChartReferenceLine = {
  axis: "x" | "y";
  value: number;
  label: string;
  color: string;
  dashed?: boolean;
};

function XYChart({
  series,
  referenceLines,
  xLabel,
  yLabel,
  ariaLabel,
  height = 360,
}: {
  series: XYSeries[];
  referenceLines?: XYChartReferenceLine[];
  xLabel: string;
  yLabel: string;
  ariaLabel: string;
  height?: number;
}) {
  const width = 980;
  const padding = { top: 28, right: 28, bottom: 60, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const allX = series.flatMap((item) => item.points.map((point) => point.x)).concat(referenceLines?.filter((line) => line.axis === "x").map((line) => line.value) ?? []);
  const allY = series.flatMap((item) => item.points.map((point) => point.y)).concat(referenceLines?.filter((line) => line.axis === "y").map((line) => line.value) ?? []);
  const minX = Math.min(...allX, 0);
  const maxX = Math.max(...allX, 1);
  const minY = Math.min(...allY);
  const maxY = Math.max(...allY);
  const xPad = Math.abs(maxX - minX) * 0.08 || 1;
  const yPad = Math.abs(maxY - minY) * 0.08 || 1;
  const domainX = [minX - xPad, maxX + xPad] as const;
  const domainY = [minY - yPad, maxY + yPad] as const;
  const xScale = (value: number) => padding.left + ((value - domainX[0]) / (domainX[1] - domainX[0] || 1)) * chartWidth;
  const yScale = (value: number) => padding.top + (1 - (value - domainY[0]) / (domainY[1] - domainY[0] || 1)) * chartHeight;
  const xTicks = Array.from({ length: 5 }, (_, index) => domainX[0] + ((domainX[1] - domainX[0]) / 4) * index);
  const yTicks = Array.from({ length: 5 }, (_, index) => domainY[0] + ((domainY[1] - domainY[0]) / 4) * index);

  const buildPath = (points: Array<{ x: number; y: number }>) =>
    points
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      .sort((a, b) => a.x - b.x)
      .map((point, index) => {
        const x = xScale(point.x);
        const y = yScale(point.y);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  return (
    <div className="xy-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {yTicks.map((tick) => {
          const y = yScale(tick);
          return (
            <g key={`y-${tick}`}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke={colors.line} strokeDasharray="6 10" />
              <text x={padding.left - 12} y={y + 4} textAnchor="end" className="chart__axis-label">
                {formatNumber(tick, 0)}
              </text>
            </g>
          );
        })}

        {xTicks.map((tick) => {
          const x = xScale(tick);
          return (
            <g key={`x-${tick}`}>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} stroke={colors.line} strokeDasharray="2 8" opacity="0.45" />
              <text x={x} y={height - 16} textAnchor="middle" className="chart__axis-label">
                {formatNumber(tick, 1)}
              </text>
            </g>
          );
        })}

        {referenceLines?.map((line) => {
          const position = line.axis === "x" ? xScale(line.value) : yScale(line.value);
          return line.axis === "x" ? (
            <g key={line.label}>
              <line
                x1={position}
                x2={position}
                y1={padding.top}
                y2={height - padding.bottom}
                stroke={line.color}
                strokeDasharray={line.dashed ? "4 8" : "none"}
              />
              <text x={position + 6} y={padding.top + 14} textAnchor="start" className="chart__threshold">
                {line.label}
              </text>
            </g>
          ) : (
            <g key={line.label}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={position}
                y2={position}
                stroke={line.color}
                strokeDasharray={line.dashed ? "4 8" : "none"}
              />
              <text x={width - padding.right} y={position - 8} textAnchor="end" className="chart__threshold">
                {line.label}
              </text>
            </g>
          );
        })}

        {series.map((item) => {
          const path = buildPath(item.points);
          return (
            <g key={item.name}>
              {path ? <path d={path} fill="none" stroke={item.color} strokeWidth={item.strokeWidth ?? 3.2} strokeDasharray={item.strokeDasharray} strokeLinecap="round" strokeLinejoin="round" /> : null}
              {item.showPoints !== false
                ? item.points.map((point, index) => (
                    <circle
                      key={`${item.name}-${index}`}
                      cx={xScale(point.x)}
                      cy={yScale(point.y)}
                      r={item.pointRadius ?? 3.6}
                      fill={item.color}
                      opacity="0.9"
                    />
                  ))
                : null}
            </g>
          );
        })}
      </svg>

      <div className="chart__legend">
        {series.map((item) => (
          <div key={item.name} className="chart__legend-item">
            <span className="chart__legend-swatch" style={{ background: item.color }} />
            <span>{item.name}</span>
          </div>
        ))}
      </div>

      <div className="xy-chart__labels">
        <span className="xy-chart__axis xy-chart__axis--y">Eje Y: {yLabel}</span>
        <span className="xy-chart__axis xy-chart__axis--x">Eje X: {xLabel}</span>
      </div>
    </div>
  );
}

function ExtrapolationTable({
  groups,
  selectedKey,
  onSelect,
}: {
  groups: ExtrapolationGroup[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const metrics: Array<{ label: string; getter: (event: ExtrapolacionEvento) => string }> = [
    { label: "Puntos tomados", getter: (event) => String(event.N_puntos) },
    { label: "P(t=0) exp", getter: (event) => formatNumber(event.P_estimada_exp, 1) },
    { label: "R2 exp", getter: (event) => formatNumber(event.R2_exp, 3) },
    { label: "P(t=0) semilog", getter: (event) => formatNumber(event.P_estimada_semilog, 1) },
    { label: "R2 semilog", getter: (event) => formatNumber(event.R2_semilog, 3) },
    { label: "P* Horner", getter: (event) => (event.P_estrella_horner == null ? "-" : formatNumber(event.P_estrella_horner, 1)) },
    { label: "m Horner", getter: (event) => (event.m_horner == null ? "-" : formatNumber(event.m_horner, 1)) },
    { label: "R2 Horner", getter: (event) => (event.R2_horner == null ? "-" : formatNumber(event.R2_horner, 3)) },
    { label: "Delta exp", getter: (event) => formatNumber(event.delta_vs_primer_dato_exp, 1) },
    { label: "Delta semilog", getter: (event) => formatNumber(event.delta_vs_primer_dato_semilog, 1) },
  ];

  return (
    <div className="extrap-table-wrap">
      <table className="extrap-table">
        <thead>
          <tr>
            <th className="extrap-table__stub">Metrica</th>
            {groups.map((group) => {
              const active = group.key === selectedKey;
              return (
                <th key={group.key} className={classNames("extrap-table__event", active && "extrap-table__event--active")}>
                  <button type="button" onClick={() => onSelect(group.key)} className="extrap-table__button">
                    <span className="extrap-table__pozo">{group.best.pozo_id}</span>
                    <strong>{formatDateTime(group.best.timestamp_evento)}</strong>
                    <span>{group.best.tipo_evento}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {metrics.map(({ label, getter }) => (
            <tr key={label}>
              <th scope="row" className="extrap-table__stub">
                {label}
              </th>
              {groups.map((group) => {
                const active = group.key === selectedKey;
                return (
                  <td key={`${group.key}-${label}`} className={classNames(active && "extrap-table__cell--active")}>
                    {getter(group.best)}
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

function ExtrapolationEventCard({
  event,
  pressureSeries,
}: {
  event: ExtrapolationGroup;
  pressureSeries: Array<{ x: number; y: number }>;
}) {
  const fitPoints = pressureSeries.length > 0 ? buildCurvePoints(event.best, pressureSeries) : [];
  const semilogFit = fitSemilog(pressureSeries);
  const expLine = fitPoints.map((point) => ({ x: point.x, y: point.exp }));
  const semilogLine = semilogFit ? fitPoints.map((point) => ({ x: point.x, y: semilogFit.a * Math.log(Math.max(point.x, 0) + 0.5) + semilogFit.b })) : [];
  const selectedSemilog = semilogLine.length > 1;
  const horner = buildHornerPoints(event.best, pressureSeries);

  const cards = [
    { label: "P(t=0) exp", value: formatNumber(event.best.P_estimada_exp, 1) },
    { label: "R2 exp", value: formatNumber(event.best.R2_exp, 3) },
    { label: "P(t=0) semilog", value: formatNumber(event.best.P_estimada_semilog, 1) },
    { label: "R2 semilog", value: formatNumber(event.best.R2_semilog, 3) },
  ];
  const hornerReferenceLines =
    event.best.P_estrella_horner != null
      ? [
          {
            axis: "y" as const,
            value: event.best.P_estrella_horner,
            label: `P* = ${formatNumber(event.best.P_estrella_horner, 1)} psi`,
            color: "#16a34a",
            dashed: true,
          },
        ]
      : [];

  return (
    <article className="extrap-card">
      <div className="extrap-card__head">
        <div>
          <h3>{formatEventLabel(event.best)}</h3>
          <p>
            N={event.best.N_puntos} puntos {event.best.tp_horas != null ? `| tp = ${formatNumber(event.best.tp_horas, 1)} h` : "| sin tp"}
            {event.best.P_estrella_horner != null && event.best.m_horner != null
              ? ` | Horner R2 = ${formatNumber(event.best.R2_horner ?? 0, 3)}`
              : ""}
          </p>
        </div>
        <Chip tone={event.best.tipo_evento === "cierre" ? "success" : "accent"}>{event.best.tipo_evento}</Chip>
      </div>

      <div className="metric-strip metric-strip--3 metric-strip--dense">
        {cards.map((card) => (
          <MetricCard key={card.label} label={card.label} value={card.value} hint={event.best.pad_id} />
        ))}
      </div>

      <div className="extrap-card__charts">
        <XYChart
          ariaLabel={`Curva de extrapolacion ${formatEventLabel(event.best)}`}
          xLabel="Tiempo relativo al evento (horas)"
          yLabel="Presion (psi)"
          series={[
            { name: "Observado", color: colors.blue, points: pressureSeries, showPoints: true, strokeWidth: 0, pointRadius: 4 },
            { name: "Exponencial", color: "#1f4bd8", points: expLine, showPoints: false, strokeWidth: 3.4 },
            ...(selectedSemilog
              ? [{ name: "Semilog", color: "#ef4444", points: semilogLine, showPoints: false, strokeDasharray: "10 7", strokeWidth: 3.2 }]
              : []),
          ]}
          referenceLines={[
            { axis: "x", value: 0, label: "t = 0", color: colors.line, dashed: true },
            { axis: "y", value: event.best.P_estimada_exp, label: `P(0) exp = ${formatNumber(event.best.P_estimada_exp, 1)}`, color: "#1f4bd8", dashed: true },
            { axis: "y", value: event.best.P_estimada_semilog, label: `P(0) slog = ${formatNumber(event.best.P_estimada_semilog, 1)}`, color: "#ef4444", dashed: true },
          ]}
        />

        {horner ? (
          <XYChart
            ariaLabel={`Grafico Horner ${formatEventLabel(event.best)}`}
            xLabel="log10[(tp + dt) / dt]"
            yLabel="Presion (psi)"
            height={330}
            series={[
              { name: "Buildup observado", color: colors.accent, points: horner.points, showPoints: true, strokeWidth: 0, pointRadius: 4.5 },
              { name: "Ajuste Horner", color: "#111827", points: horner.line, showPoints: false, strokeWidth: 3.2 },
              { name: "P*", color: "#16a34a", points: [horner.star], showPoints: true, strokeWidth: 0, pointRadius: 7 },
            ]}
            referenceLines={hornerReferenceLines}
          />
        ) : (
          <div className="extrap-card__empty">
            <strong>Horner no disponible</strong>
            <span>Este evento no tiene tp_horas ni parametros de Horner.</span>
          </div>
        )}
      </div>
    </article>
  );
}

function WellCarousel<T>({
  items,
  activeIndex,
  onChange,
  renderItem,
  emptyLabel,
}: {
  items: T[];
  activeIndex: number;
  onChange: (index: number) => void;
  renderItem: (item: T, index: number) => React.ReactNode;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <div className="loading-card">{emptyLabel}</div>;
  }

  const safeIndex = ((activeIndex % items.length) + items.length) % items.length;
  const prevIndex = (safeIndex - 1 + items.length) % items.length;
  const nextIndex = (safeIndex + 1) % items.length;
  const activeItem = items[safeIndex];

  return (
    <div className="well-carousel">
      <button type="button" className="well-carousel__arrow well-carousel__arrow--left" onClick={() => onChange(prevIndex)} aria-label="Pozo anterior">
        ‹
      </button>
      <div className="well-carousel__viewport">{renderItem(activeItem, safeIndex)}</div>
      <button type="button" className="well-carousel__arrow well-carousel__arrow--right" onClick={() => onChange(nextIndex)} aria-label="Pozo siguiente">
        ›
      </button>
    </div>
  );
}

function ModelCard({
  model,
  active,
  disabled,
  onClick,
}: {
  model: ModelReport;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={classNames("model-card", active && "model-card--active", disabled && "model-card--disabled")} onClick={onClick} disabled={disabled}>
      <div className="model-card__head">
        <div>
          <h3>{model.label}</h3>
          <p>
            {model.status === "trained"
              ? "Modelo entrenado y evaluado sobre el tramo final de la serie."
              : "Bloque reservado para correr XGBoost cuando la dependencia esté disponible."}
          </p>
        </div>
        <Chip tone={model.status === "trained" ? "success" : "accent"}>{model.status === "trained" ? "listo" : "pendiente"}</Chip>
      </div>

      {model.status === "trained" ? (
        <div className="model-card__body">
          <div className="model-card__metrics">
            <span>
              CV RMSE <strong>{formatNumber(model.cv_rmse, 3)}</strong>
            </span>
            <span>
              Test RMSE <strong>{formatNumber(model.metrics.RMSE, 3)}</strong>
            </span>
            <span>
              MAE <strong>{formatNumber(model.metrics.MAE, 3)}</strong>
            </span>
            <span>
              R² <strong>{formatNumber(model.metrics.R2, 4)}</strong>
            </span>
          </div>
          <div className="model-card__params">
            {Object.entries(model.best_params)
              .slice(0, 3)
              .map(([key, value]) => (
                <Chip key={key} tone="neutral">
                  {key.replace(/__/g, " ")} = {String(value)}
                </Chip>
              ))}
          </div>
        </div>
      ) : (
        <p className="model-card__note">{model.note}</p>
      )}
    </button>
  );
}

function LoadingState() {
  return (
    <main className="page">
      <div className="orb orb--one" />
      <div className="orb orb--two" />
      <div className="shell">
        <div className="loading-card">Cargando dashboard...</div>
      </div>
    </main>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "upload" | "docs" | "presion-boca">("dashboard");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadataFile, setMetadataFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<"select" | "form">("select");
  const [wellCount, setWellCount] = useState<string>("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [extrapolacion, setExtrapolacion] = useState<ExtrapolacionEvento[]>([]);
  const [analisisFirmas, setAnalisisFirmas] = useState<AnalisisFirma[]>([]);
  const [presionT0, setPresionT0] = useState<PresionT0Pad[]>([]);
  const [presionBoca, setPresionBoca] = useState<PresionBoca[]>([]);
  const [presionFondo, setPresionFondo] = useState<PresionFondo[]>([]);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedExtrapolationKey, setSelectedExtrapolationKey] = useState<string | null>(null);
  const [activeExtrapolationPozoIndex, setActiveExtrapolationPozoIndex] = useState(0);
  const [activeBocaIndex, setActiveBocaIndex] = useState(0);
  const [activeFondoIndex, setActiveFondoIndex] = useState(0);
  const columnsListId = "csv-columns-list";
    const updateWellCount = (value: number) => {
      const safeValue = Math.min(3, Math.max(1, value));
      setWellCount(String(safeValue));
      setWellMappings((prev) => {
        const next = [...prev];
        while (next.length < safeValue) {
          next.push({
            presion_boca_psi: "",
            presion_anular_psi: "",
            orificio_mm: "",
            temperatura_boca_c: "",
            densidad_agua_kg_l: "",
            cloro_agua_g_l: "",
            solidos_kg_hora: "",
            solidos_l_hora: "",
            solidos_acum_kg: "",
          });
        }
        return next.slice(0, safeValue);
      });
    };
  const [wellMappings, setWellMappings] = useState<Array<Record<string, string>>>([
    {
      presion_boca_psi: "",
      presion_anular_psi: "",
      orificio_mm: "",
      temperatura_boca_c: "",
      densidad_agua_kg_l: "",
      cloro_agua_g_l: "",
      solidos_kg_hora: "",
      solidos_l_hora: "",
      solidos_acum_kg: "",
    },
  ]);

  const handleSubmitConfig = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const parsedWellCount = Math.max(1, Number(wellCount) || 1);
    const datosSheet = "";
    const datosHeader = 1;
    const metadataSheet = "";
    const metadataHeader = 1;

    const config = {
      datos: {
        sheet: datosSheet,
        header_rows: datosHeader,
        mapping: {
          fecha_hora: "FECHA Y HORA",
          pozos: wellMappings.slice(0, parsedWellCount).map((mapping, index) => ({
            id: `pozo_${index + 1}`,
            boca_psi: mapping.presion_boca_psi,
            anular_psi: mapping.presion_anular_psi,
            orificio_mm: mapping.orificio_mm,
            temperatura_boca_c: mapping.temperatura_boca_c,
            densidad_agua_kg_l: mapping.densidad_agua_kg_l,
            cloro_agua_g_l: mapping.cloro_agua_g_l,
            solidos_kg_hora: mapping.solidos_kg_hora,
            solidos_l_hora: mapping.solidos_l_hora,
            solidos_acum_kg: mapping.solidos_acum_kg,
          })),
        },
      },
      metadata: {
        sheet: metadataSheet,
        header_rows: metadataHeader,
        mapping: {},
      },
      options: {
        rolling_window: 12,
        sensor_z_thresh: 4.0,
        run_model: false,
      },
    };

    try {
      const bucketName = "tppstorage";
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

      if (!selectedFile || !metadataFile) {
        throw new Error("Faltan archivos para subir a Supabase");
      }

      const datosPath = `uploads/${timestamp}-${selectedFile.name}`;
      const metadataPath = `uploads/${timestamp}-${metadataFile.name}`;
      const jsonPath = `uploads/${timestamp}-config.json`;
      const configBlob = new Blob([JSON.stringify({ config, wellCount })], { type: "application/json" });

      const [datosUpload, metadataUpload, jsonUpload] = await Promise.all([
        supabase.storage.from(bucketName).upload(datosPath, selectedFile, { upsert: false }),
        supabase.storage.from(bucketName).upload(metadataPath, metadataFile, { upsert: false }),
        supabase.storage.from(bucketName).upload(jsonPath, configBlob, { upsert: false, contentType: "application/json" }),
      ]);

      if (datosUpload.error || metadataUpload.error || jsonUpload.error) {
        const message =
          datosUpload.error?.message || metadataUpload.error?.message || jsonUpload.error?.message || "Error al subir archivos";
        throw new Error(message);
      }

      console.log("Supabase uploads ok", {
        datosPath,
        metadataPath,
        jsonPath,
      });

      console.log("Supabase flow ok - backend POST skipped");
      setSubmitSuccess("Archivos y configuracion subidos correctamente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al enviar configuracion";
      console.error("Supabase upload error", message);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const pad = "PAD_sintetico_3P";
    const pozo = "Pozo1";

    const load = async () => {
      try {
        setApiLoading(true);
        setApiError(null);

        const [extrap, firmas, t0, bocaPozo1, bocaPozo2, bocaPozo3, fondo] = await Promise.all([
          fetchJson<ExtrapolacionEvento[]>(apiUrl("/pressure-extrapolation/extrapolacion_eventos", { pad })),
          fetchJson<AnalisisFirma[]>(apiUrl("/pressure-extrapolation/analisis_firmas")),
          fetchJson<PresionT0Pad[]>(apiUrl("/pressure-extrapolation/presion_t0_pad", { pad })),
          fetchJson<PresionBoca[]>(apiUrl("/well-analysis/presion_boca", { pad, pozo: "Pozo1" })),
          fetchJson<PresionBoca[]>(apiUrl("/well-analysis/presion_boca", { pad, pozo: "Pozo2" })),
          fetchJson<PresionBoca[]>(apiUrl("/well-analysis/presion_boca", { pad, pozo: "Pozo3" })),
          fetchJson<PresionFondo[]>(apiUrl("/well-analysis/presion_fondo", { pad })),
        ]);

        if (mounted) {
          setExtrapolacion(extrap);
          setAnalisisFirmas(firmas);
          setPresionT0(t0);
          setPresionBoca([...bocaPozo1, ...bocaPozo2, ...bocaPozo3]);
          setPresionFondo(fondo);
        }
      } catch (error) {
        if (mounted) {
          const message = error instanceof Error ? error.message : "Error al cargar datos";
          setApiError(message);
        }
      } finally {
        if (mounted) {
          setApiLoading(false);
        }
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const extrapGroups = useMemo<ExtrapolationGroup[]>(() => {
    const grouped = new Map<string, ExtrapolacionEvento[]>();
    extrapolacion.forEach((item) => {
      const key = buildEventKey(item);
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    });

    return Array.from(grouped.entries())
      .map(([key, rows]) => {
        const best = selectBestWindow(rows);
        const score = mean([best.R2_exp, best.R2_semilog].filter(isFiniteNumber));
        return {
          key,
          rows,
          best,
          score,
          label: formatEventLabel(best),
        };
      })
      .sort((a, b) => {
        const timeDiff = a.best.timestamp_evento.localeCompare(b.best.timestamp_evento);
        if (timeDiff !== 0) return timeDiff;
        if (a.best.pozo_id !== b.best.pozo_id) return a.best.pozo_id.localeCompare(b.best.pozo_id);
        if (a.best.tipo_evento !== b.best.tipo_evento) return a.best.tipo_evento.localeCompare(b.best.tipo_evento);
        return b.score - a.score;
      });
  }, [extrapolacion]);

  const extrapGroupsByPozo = useMemo(() => {
    const grouped = new Map<string, ExtrapolationGroup[]>();
    extrapGroups.forEach((group) => {
      const list = grouped.get(group.best.pozo_id) ?? [];
      list.push(group);
      grouped.set(group.best.pozo_id, list);
    });

    const preferredOrder = ["Pozo1", "Pozo2", "Pozo3"];
    const orderedPozos = [
      ...preferredOrder.filter((pozo) => grouped.has(pozo)),
      ...Array.from(grouped.keys()).filter((pozo) => !preferredOrder.includes(pozo)).sort((a, b) => a.localeCompare(b)),
    ];

    return orderedPozos.map((pozo) => ({
      pozo,
      groups: (grouped.get(pozo) ?? []).slice().sort((a, b) => {
        const timeDiff = a.best.timestamp_evento.localeCompare(b.best.timestamp_evento);
        if (timeDiff !== 0) return timeDiff;
        return b.score - a.score;
      }),
    }));
  }, [extrapGroups]);

  useEffect(() => {
    if (extrapGroups.length > 0 && (!selectedExtrapolationKey || !extrapGroups.some((group) => group.key === selectedExtrapolationKey))) {
      setSelectedExtrapolationKey(extrapGroups[0].key);
    }
  }, [extrapGroups, selectedExtrapolationKey]);

  const firmasSorted = useMemo(() => [...analisisFirmas].sort((a, b) => a.t_inicio.localeCompare(b.t_inicio)), [analisisFirmas]);
  const bocaByPozo = useMemo(() => {
    const grouped = new Map<string, PresionBoca[]>();
    presionBoca.forEach((item) => {
      const list = grouped.get(item.pozo_id) ?? [];
      list.push(item);
      grouped.set(item.pozo_id, list);
    });

    return Array.from(grouped.entries()).map(([pozo, items]) => ({
      pozo,
      items: [...items].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    }));
  }, [presionBoca]);
  const fondoByPozo = useMemo(() => {
    const grouped = new Map<string, PresionFondo[]>();
    presionFondo.forEach((item) => {
      const list = grouped.get(item.pozo_id) ?? [];
      list.push(item);
      grouped.set(item.pozo_id, list);
    });
    return Array.from(grouped.entries()).map(([pozo, items]) => ({
      pozo,
      items: items.sort((a, b) => a.fecha_medicion.localeCompare(b.fecha_medicion)),
    }));
  }, [presionFondo]);
  const selectedExtrapolation = useMemo(
    () => extrapGroups.find((group) => group.key === selectedExtrapolationKey) ?? extrapGroups[0] ?? null,
    [extrapGroups, selectedExtrapolationKey],
  );
  const selectedExtrapolationSeries = useMemo(() => {
    if (!selectedExtrapolation) return [];
    return buildPressureSeriesForEvent(selectedExtrapolation.best, bocaByPozo);
  }, [bocaByPozo, selectedExtrapolation]);

  useEffect(() => {
    if (bocaByPozo.length > 0) {
      setActiveBocaIndex((current) => Math.min(current, bocaByPozo.length - 1));
    } else {
      setActiveBocaIndex(0);
    }
  }, [bocaByPozo.length]);

  useEffect(() => {
    if (fondoByPozo.length > 0) {
      setActiveFondoIndex((current) => Math.min(current, fondoByPozo.length - 1));
    } else {
      setActiveFondoIndex(0);
    }
  }, [fondoByPozo.length]);

  useEffect(() => {
    if (extrapGroupsByPozo.length > 0) {
      setActiveExtrapolationPozoIndex((current) => Math.min(current, extrapGroupsByPozo.length - 1));
    } else {
      setActiveExtrapolationPozoIndex(0);
    }
  }, [extrapGroupsByPozo.length]);


  return (
    <main className="page">
      <div className="orb orb--one" />
      <div className="orb orb--two" />
      <div className="orb orb--three" />

      <div className="shell">
        <header className="topbar">
          <img src={tecpetrolLogo} alt="Tecpetrol" className="topbar__logo" />
          <nav className="tabs" aria-label="Secciones">
            <button
              type="button"
              className={classNames("tab", activeTab === "dashboard" && "tab--active")}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className={classNames("tab", activeTab === "upload" && "tab--active")}
              onClick={() => setActiveTab("upload")}
            >
              Cargar CSV
            </button>
            <button
              type="button"
              className={classNames("tab", activeTab === "docs" && "tab--active")}
              onClick={() => setActiveTab("docs")}
            >
              Documentacion
            </button>
            <button
              type="button"
              className={classNames("tab", activeTab === "presion-boca" && "tab--active")}
              onClick={() => setActiveTab("presion-boca")}
            >
              Análisis presión
            </button>
          </nav>
        </header>

        {activeTab === "presion-boca" ? (
          <PresionBocaAnalysis />
        ) : activeTab === "upload" ? (
          <section className="upload">
            {uploadStep === "select" ? (
              <div className="upload__card">
                <h1>Cargar archivos XLSX</h1>
                <p>
                  Subi los dos Excel con el mismo formato del pipeline. La carga valida el archivo en el navegador y deja listo el envio cuando
                  integremos el backend.
                </p>
                <label className="upload__drop">
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSelectedFile(file);
                      setCsvColumns([]);
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const buffer = reader.result;
                          if (buffer instanceof ArrayBuffer) {
                            setCsvColumns(parseXlsxHeaders(buffer));
                          }
                        };
                        reader.readAsArrayBuffer(file);
                      }
                      if (file && metadataFile) {
                        setUploadStep("form");
                      }
                    }}
                  />
                  <span className="upload__title">Arrastra el archivo o hace click</span>
                  <span className="upload__hint">Formato XLSX, maximo 50 MB</span>
                </label>
                {selectedFile ? (
                  <div className="upload__meta">
                    <div>
                      <strong>{selectedFile.name}</strong>
                      <span>{formatNumber(selectedFile.size / 1024, 1)} KB</span>
                    </div>
                    <button type="button" className="upload__clear" onClick={() => setSelectedFile(null)}>
                      Quitar
                    </button>
                  </div>
                ) : null}

                <div className="upload__divider" />

                <h2 className="upload__subtitle">Metadata</h2>
                <p className="upload__note">
                  Subi el archivo de presiones de fondo en formato Excel para habilitar la carga.
                </p>
                <label className="upload__drop upload__drop--secondary">
                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setMetadataFile(file);
                      if (file && selectedFile) {
                        setUploadStep("form");
                      }
                    }}
                  />
                  <span className="upload__title">Arrastra el metadata o hace click</span>
                  <span className="upload__hint">Formato XLSX</span>
                </label>
                {metadataFile ? (
                  <div className="upload__meta">
                    <div>
                      <strong>{metadataFile.name}</strong>
                      <span>{formatNumber(metadataFile.size / 1024, 1)} KB</span>
                    </div>
                    <button type="button" className="upload__clear" onClick={() => setMetadataFile(null)}>
                      Quitar
                    </button>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="upload__action"
                  onClick={() => setUploadStep("form")}
                  disabled={!selectedFile || !metadataFile}
                >
                  Cargar
                </button>
              </div>
            ) : (
              <div className="upload__card upload__card--wide">
                <div className="upload__form-head">
                  <div>
                    <h1>Formulario de columnas</h1>
                    <p>Completa los nombres exactos tal como aparecen en tu Excel.</p>
                  </div>
                  <button type="button" className="upload__clear" onClick={() => setUploadStep("select")}>
                    Volver
                  </button>
                </div>

                <div className="form__field">
                  <span>Cuantos pozos pasas (max 3)</span>
                  <div className="stepper">
                    {[1, 2, 3].map((step) => (
                      <button
                        key={step}
                        type="button"
                        className={classNames("stepper__dot", Number(wellCount) === step && "stepper__dot--active")}
                        onClick={() => updateWellCount(step)}
                        aria-label={`Seleccionar ${step} pozo${step > 1 ? "s" : ""}`}
                      >
                        <span>{step}</span>
                      </button>
                    ))}
                    <div className="stepper__line" aria-hidden="true" />
                  </div>
                </div>

                {wellMappings.map((mapping, wellIndex) => (
                  <div key={`pozo-${wellIndex}`} className="form__section">
                    <h2 className="form__section-title">Pozo {wellIndex + 1}</h2>
                    <div className="form__grid">
                      {[
                        {
                          key: "presion_boca_psi",
                          label: "presion_boca_psi (Presion Boca)"
                        },
                        {
                          key: "presion_anular_psi",
                          label: "presion_anular_psi (Presion Anular)"
                        },
                        {
                          key: "orificio_mm",
                          label: "orificio_mm (Orificio)"
                        },
                        {
                          key: "temperatura_boca_c",
                          label: "temperatura_boca_c (Temperatura)"
                        },
                        {
                          key: "densidad_agua_kg_l",
                          label: "densidad_agua_kg_l (Densidad AGUA)"
                        },
                        {
                          key: "cloro_agua_g_l",
                          label: "cloro_agua_g_l (CLORO)"
                        },
                        {
                          key: "solidos_kg_hora",
                          label: "solidos_kg_hora (Solidos kg/hora)"
                        },
                        {
                          key: "solidos_l_hora",
                          label: "solidos_l_hora (Solidos lts/hora)"
                        },
                        {
                          key: "solidos_acum_kg",
                          label: "solidos_acum_kg (Acumulado Solidos)"
                        },
                      ].map((field) => (
                        <label key={`${field.key}-${wellIndex}`} className="form__field">
                          <span>{field.label}</span>
                          <input
                            type="text"
                            list={columnsListId}
                            placeholder="Escribir y seleccionar"
                            value={mapping[field.key]}
                            onChange={(event) =>
                              setWellMappings((prev) =>
                                prev.map((item, index) =>
                                  index === wellIndex
                                    ? {
                                        ...item,
                                        [field.key]: event.target.value,
                                      }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <datalist id={columnsListId}>
                  {csvColumns.map((column) => (
                    <option key={`column-${column}`} value={column} />
                  ))}
                </datalist>

                {submitError ? <div className="upload__status upload__status--error">{submitError}</div> : null}
                {submitSuccess ? <div className="upload__status upload__status--success">{submitSuccess}</div> : null}
                <button type="button" className="upload__action" onClick={handleSubmitConfig} disabled={isSubmitting}>
                  {isSubmitting ? "Enviando..." : "Guardar configuracion"}
                </button>
              </div>
            )}
          </section>
        ) : activeTab === "docs" ? (
          <section className="docs">
            <div className="docs__card">
              <h1>Documentacion del formato</h1>
              <p>Estas reglas explican como debe venir el Excel para que el pipeline lo procese correctamente.</p>

              <div className="docs__grid">
                <div className="docs__block">
                  <h2>Reglas del Excel</h2>
                  <ul className="docs__list">
                    <li>El archivo debe tener una fila de encabezados.</li>
                    <li>La columna de fecha/hora debe llamarse exactamente: FECHA Y HORA.</li>
                    <li>Cada fila debe representar una medicion temporal.</li>
                    <li>No usar celdas combinadas ni multiples filas de encabezado.</li>
                    <li>No dejar filas vacias entre registros.</li>
                    <li>Los nombres de columnas deben contener las palabras clave esperadas.</li>
                    <li>Las columnas criticas no pueden faltar.</li>
                  </ul>
                </div>

                <div className="docs__block">
                  <h2>Columnas obligatorias</h2>
                  <p><strong>Por cada pozo</strong></p>
                  <ul className="docs__list">
                    <li>Presion Boca + Pozo1 / Pozo2 / Pozo3</li>
                    <li>Presion Anular + Pozo1 / Pozo2 / Pozo3</li>
                  </ul>
                  <p><strong>Del PAD</strong></p>
                  <ul className="docs__list">
                    <li>Presion Separador (psi)</li>
                    <li>Caudal Liquidos totales (l/hora)</li>
                    <li>Caudal GAS (m3/hora)</li>
                  </ul>
                </div>
              </div>

              <div className="docs__block">
                <h2>Ejemplos validos</h2>
                <ul className="docs__list">
                  <li>Presion Boca de pozo (psi) Pozo1</li>
                  <li>Presion Anular (psi) Pozo1</li>
                  <li>Presion Separador (psi)</li>
                  <li>Caudal Liquidos totales (l/hora)</li>
                  <li>Caudal GAS (m3/hora)</li>
                </ul>
              </div>

              <div className="docs__block">
                <h2>Columnas opcionales</h2>
                <p>El sistema tambien puede leer, si existen:</p>
                <ul className="docs__list">
                  <li>Orificio</li>
                  <li>Temperatura</li>
                  <li>Densidad AGUA</li>
                  <li>CLORO</li>
                  <li>Solidos</li>
                  <li>OIL</li>
                  <li>AGUA</li>
                  <li>GLR</li>
                  <li>Comentarios</li>
                </ul>
                <p>Si alguna columna opcional no esta, se completa con valores vacios.</p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <Panel title="Datos reales (API)" subtitle="Visualizaciones generadas desde los endpoints en vivo.">
              {apiLoading ? <div className="loading-card">Cargando datos API...</div> : null}
              {apiError ? <div className="upload__status upload__status--error">{apiError}</div> : null}
            </Panel>

            {!apiLoading && !apiError ? (
              <>
                <Panel title="Presion de boca" subtitle="Usa las flechas para cambiar de pozo sin llenar la pagina de paneles.">
                  <WellCarousel
                    items={bocaByPozo}
                    activeIndex={activeBocaIndex}
                    onChange={setActiveBocaIndex}
                    emptyLabel="Sin datos de presion de boca."
                    renderItem={(group) => (
                      <div className="well-carousel__card">
                        <div className="well-carousel__head">
                          <div>
                            <h3>{group.pozo}</h3>
                            <p>{group.items.length} registros</p>
                          </div>
                          <Chip tone="neutral">
                            {group.pozo}
                          </Chip>
                        </div>
                        <LineChart
                          labels={group.items.map((row) => formatDateTime(row.timestamp))}
                          series={[
                            { name: "Boca (psi)", color: colors.accent, values: fillMissing(group.items.map((row) => row.presion_boca_psi)) },
                            { name: "Anular (psi)", color: colors.blue, values: fillMissing(group.items.map((row) => row.presion_anular_psi)) },
                            { name: "Hidro (psi)", color: colors.accent2, values: fillMissing(group.items.map((row) => row.P_hidro_boca_psi)) },
                          ]}
                          ariaLabel={`Presion de boca ${group.pozo}`}
                        />
                      </div>
                    )}
                  />
                </Panel>

                <Panel title="Presion T0 por pozo" subtitle="Comparacion de P_t0 medido en cada pozo.">
                  <HorizontalBarChart
                    items={presionT0
                      .filter((item) => item.pozo_id !== "PAD_resumen")
                      .map((item) => ({
                        label: item.pozo_id,
                        value: item.P_t0_medido,
                      }))}
                    ariaLabel="Presion T0 por pozo"
                  />
                </Panel>

                <Panel title="Analisis de firmas" subtitle="Tendencia de presion media y desvio por segmento.">
                  <LineChart
                    labels={firmasSorted.map((row) => formatDateTime(row.t_inicio))}
                    series={[
                      { name: "P media", color: colors.accent, values: firmasSorted.map((row) => row.p_media) },
                      { name: "P std", color: colors.blue, values: firmasSorted.map((row) => row.p_std) },
                    ]}
                    ariaLabel="Analisis de firmas"
                  />
                </Panel>

                <Panel title="Tablas de extrapolacion" subtitle="Usa las flechas para cambiar de pozo sin apilar tablas en toda la pantalla.">
                  <WellCarousel
                    items={extrapGroupsByPozo}
                    activeIndex={activeExtrapolationPozoIndex}
                    onChange={setActiveExtrapolationPozoIndex}
                    emptyLabel="Sin datos de extrapolacion."
                    renderItem={(groupByPozo) => (
                      <section className="extrap-table-panel">
                        <div className="panel__subhead panel__subhead--compact">
                          <div>
                            <h3>{groupByPozo.pozo}</h3>
                            <p>{groupByPozo.groups.length} eventos extrapolados</p>
                          </div>
                          <Chip tone="neutral">{groupByPozo.pozo}</Chip>
                        </div>
                        <ExtrapolationTable
                          groups={groupByPozo.groups}
                          selectedKey={selectedExtrapolationKey}
                          onSelect={setSelectedExtrapolationKey}
                        />
                      </section>
                    )}
                  />
                </Panel>

                {selectedExtrapolation ? (
                  <Panel
                    title={`Curvas seleccionadas (${selectedExtrapolation.label})`}
                    subtitle="Curvas reconstruidas con los datos reales del endpoint y la serie temporal del pozo."
                  >
                    <ExtrapolationEventCard event={selectedExtrapolation} pressureSeries={selectedExtrapolationSeries} />
                  </Panel>
                ) : null}

                <Panel title="Curvas por evento" subtitle="Una tarjeta por evento con su ajuste exp, semilog y Horner cuando aplica.">
                  <div className="extrap-grid">
                    {extrapGroups.map((group) => (
                      <ExtrapolationEventCard
                        key={group.key}
                        event={group}
                        pressureSeries={buildPressureSeriesForEvent(group.best, bocaByPozo)}
                      />
                    ))}
                  </div>
                </Panel>

                <Panel title="Presion de fondo" subtitle="Carrusel por pozo para comparar sin apilar paneles infinitos.">
                  <WellCarousel
                    items={fondoByPozo}
                    activeIndex={activeFondoIndex}
                    onChange={setActiveFondoIndex}
                    emptyLabel="Sin datos de presion de fondo."
                    renderItem={(group) => (
                      <div className="well-carousel__card">
                        <div className="well-carousel__head">
                          <div>
                            <h3>{group.pozo}</h3>
                            <p>{group.items.length} registros</p>
                          </div>
                          <Chip tone="neutral">{group.pozo}</Chip>
                        </div>
                        <LineChart
                          labels={group.items.map((row) => formatDate(row.fecha_medicion))}
                          series={[
                            { name: "P fondo (psia)", color: colors.accent, values: group.items.map((row) => row.presion_psia) },
                            { name: "Hidro fondo", color: colors.accent2, values: fillMissing(group.items.map((row) => row.P_hidro_fondo_psia)) },
                          ]}
                          ariaLabel={`Presion fondo ${group.pozo}`}
                        />
                      </div>
                    )}
                  />
                </Panel>
              </>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

export default App;
