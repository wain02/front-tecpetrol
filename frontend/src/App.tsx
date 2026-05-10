import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import tecpetrolLogo from "../logos/logo-tecpe.png";

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
  const [report, setReport] = useState<ReportData | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelKey>("rf");
  const [activeTab, setActiveTab] = useState<"dashboard" | "upload" | "docs">("dashboard");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadataFile, setMetadataFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<"select" | "form">("select");
  const [wellCount, setWellCount] = useState<string>("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
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

  const handleSubmitConfig = async () => {
    setIsSubmitting(true);
    setSubmitError(null);

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
          pozos: [
            {
              id: "pozo_1",
              boca_psi: columnMap.presion_boca_psi,
              anular_psi: columnMap.presion_anular_psi,
              orificio_mm: columnMap.orificio_mm,
              temperatura_boca_c: columnMap.temperatura_boca_c,
              densidad_agua_kg_l: columnMap.densidad_agua_kg_l,
              cloro_agua_g_l: columnMap.cloro_agua_g_l,
              solidos_kg_hora: columnMap.solidos_kg_hora,
              solidos_l_hora: columnMap.solidos_l_hora,
              solidos_acum_kg: columnMap.solidos_acum_kg,
              total_pozos: parsedWellCount,
            },
          ],
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

    const payload = new FormData();
    if (selectedFile) {
      payload.append("datos", selectedFile);
    }
    if (metadataFile) {
      payload.append("metadata", metadataFile);
    }
    payload.append("config", JSON.stringify(config));

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        body: payload,
      });

      if (!response.ok) {
        throw new Error(`Submit error: ${response.status}`);
      }

      const result = await response.json();
      console.log("POST /api/jobs ok", result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al enviar configuracion";
      console.error("POST /api/jobs error", message);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    fetch("/report.json")
      .then((response) => response.json())
      .then((data: ReportData) => {
        if (mounted) {
          setReport(data);
          setSelectedModel(data.models.rf.status === "trained" ? "rf" : "baseline");
        }
      })
      .catch(() => {
        if (mounted) {
          setReport(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const selected = useMemo(() => {
    if (!report) return null;
    return report.models[selectedModel];
  }, [report, selectedModel]);

  if (!report) {
    return <LoadingState />;
  }

  const activeModel = selected && selected.status === "trained" ? selected : report.models.baseline;
  const preview = activeModel.prediction_preview;
  const labels = preview.map((row) => formatDate(row.date));
  const firstActual = preview.map((row) => row.actual_gor);
  const firstPredicted = selectedModel === "baseline" ? preview.map((row) => row.baseline_pred) : preview.map((row) => row.rf_pred);
  const productionLabels = report.production_series.map((row) => formatDateTime(row.date));
  const gasSeries = report.production_series.map((row) => row.gas_m3_hora);
  const liquidSeries = report.production_series.map((row) => row.liquid_m3_hora);
  const ratioSeries = report.production_series.map((row) => row.gas_to_liquid_ratio);
  const featureBars = activeModel.importance.slice(0, 12).map((item) => ({
    label: item.feature,
    value: item.importance,
  }));
  const topFeatures = [...activeModel.importance].slice(0, 5);
  const testGap = activeModel.metrics.RMSE - activeModel.cv_rmse;
  const coverageLabel = `${formatNumber(report.dataset.gor_coverage * 100, 1)}%`;

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
          </nav>
        </header>

        {activeTab === "upload" ? (
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

                <label className="form__field">
                  <span>Cuantos pozos pasas</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ej: 3"
                    value={wellCount}
                    onChange={(event) => setWellCount(event.target.value)}
                  />
                </label>

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
                    <label key={field.key} className="form__field">
                      <span>{field.label}</span>
                      <select
                        value={columnMap[field.key]}
                        onChange={(event) =>
                          setColumnMap((prev) => ({
                            ...prev,
                            [field.key]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Seleccionar columna</option>
                        {csvColumns.map((column) => (
                          <option key={`${field.key}-${column}`} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                {submitError ? <div className="upload__status upload__status--error">{submitError}</div> : null}
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
            <header className="hero">
              <div className="hero__copy">
                <div className="hero__brand">
                  <img src={tecpetrolLogo} alt="Tecpetrol" className="hero__logo" />
                </div>
                <div className="hero__eyebrow">
                  <span className="hero__dot" />
                  React dashboard para modelado de presión
                </div>
                <h1>{report.project.title}</h1>
                <p className="hero__lead">{report.project.subtitle}</p>
                <p className="hero__body">
                  La interfaz ya consume un snapshot real del pipeline: dataset limpio, features de presión por pozo y una comparación inicial entre
                  baseline y Random Forest. XGBoost quedó reservado para cuando la dependencia esté disponible.
                </p>

                <div className="hero__chips">
                  <Chip tone="accent">{report.dataset.well_count} pozos</Chip>
                  <Chip tone="success">{coverageLabel} con GOR</Chip>
                  <Chip tone="neutral">{report.dataset.feature_count} features</Chip>
                  <Chip tone="neutral">GOR continuo</Chip>
                </div>
              </div>

              <div className="hero__stats">
                <MetricCard label="Registros" value={formatNumber(report.dataset.rows)} hint="Filas totales del Excel limpio" tone="default" />
                <MetricCard label="Entrenables" value={formatNumber(report.dataset.trainable_rows)} hint="Filas con GOR disponible" tone="accent" />
                <MetricCard label="GOR promedio" value={formatNumber(report.dataset.gor_mean, 1)} hint="m³ gas / m³ líquido" tone="success" />
                <MetricCard label="WOR promedio" value={formatNumber(report.dataset.wor_mean, 4)} hint="Casi constante, se descarta" tone="default" />
              </div>
            </header>

        <section className="metric-strip">
          <MetricCard label="GOR mediana" value={formatNumber(report.dataset.gor_median, 1)} hint="Punto central de la distribución" />
          <MetricCard label="GOR desvío" value={formatNumber(report.dataset.gor_std, 1)} hint="Mide dispersión real del target" />
          <MetricCard label="WOR desvío" value={formatNumber(report.dataset.wor_std, 4)} hint="Confirmación de baja señal" />
          <MetricCard label="Ventana temporal" value={`${formatDate(report.dataset.date_min)} → ${formatDate(report.dataset.date_max)}`} hint="Cobertura del dataset" />
        </section>

        <Panel
          title="Estadísticas del GOR"
          subtitle="Las métricas exploratorias del backend quedan visibles acá para leer la distribución antes del modelado."
        >
          <div className="metric-strip metric-strip--dense">
            <MetricCard label="Muestras GOR" value={formatNumber(report.gor_stats.count)} hint="Filas con target disponible" />
            <MetricCard label="Media" value={formatNumber(report.gor_stats.mean, 2)} hint="Valor promedio del GOR" />
            <MetricCard label="Desvío" value={formatNumber(report.gor_stats.std, 2)} hint="Dispersión del target" />
            <MetricCard label="Mín / Máx" value={`${formatNumber(report.gor_stats.min, 2)} / ${formatNumber(report.gor_stats.max, 2)}`} hint="Rango completo observado" />
          </div>

          <div className="metric-strip metric-strip--dense metric-strip--3">
            <MetricCard label="P25 / Mediana / P75" value={`${formatNumber(report.gor_stats.p25, 2)} / ${formatNumber(report.gor_stats.p50, 2)} / ${formatNumber(report.gor_stats.p75, 2)}`} hint="Cuartiles de la distribución" />
            <MetricCard label="IQR" value={formatNumber(report.gor_stats.iqr, 2)} hint="Rango intercuartílico" />
            <MetricCard label="Outliers" value={`${report.gor_stats.n_outliers} (${report.gor_stats.pct_outliers})`} hint="Método IQR de Tukey" />
            <MetricCard label="Fences" value={`${formatNumber(report.gor_stats.lower_fence, 2)} / ${formatNumber(report.gor_stats.upper_fence, 2)}`} hint="Límites inferior y superior" />
            <MetricCard label="Gas dominante" value={formatNumber(report.gor_stats.n_gas_dominante)} hint={`GOR >= ${report.regime_thresholds.gas}`} />
            <MetricCard label="Mixto" value={formatNumber(report.gor_stats.n_mixto)} hint={`Entre ${report.regime_thresholds.liquid} y ${report.regime_thresholds.gas}`} />
            <MetricCard label="Líquido dominante" value={formatNumber(report.gor_stats.n_liquido_dominante)} hint={`GOR < ${report.regime_thresholds.liquid}`} />
          </div>
        </Panel>

        <Panel
          title="Resultados de modelado"
          subtitle="La comparación queda lista para leer XGBoost cuando esté disponible y ya muestra el comportamiento real de Baseline y Random Forest."
        >
          <div className="model-grid">
            <ModelCard
              model={report.models.baseline}
              active={selectedModel === "baseline"}
              onClick={() => setSelectedModel("baseline")}
            />
            <ModelCard model={report.models.rf} active={selectedModel === "rf"} onClick={() => setSelectedModel("rf")} />
            <ModelCard
              model={report.models.xgb}
              active={selectedModel === "xgb"}
              disabled
              onClick={() => setSelectedModel("xgb")}
            />
          </div>

          <div className="result-grid">
            <div className="result-grid__chart">
              <div className="panel__subhead">
                <div>
                  <h3>Predicción vs real</h3>
                  <p>
                    Tramo de test para {activeModel.label}. El modelo elegido se compara contra la curva real de GOR y los umbrales físicos
                    propuestos para régimen líquido y gas.
                  </p>
                </div>
                <div className="panel__chips">
                  <Chip tone="neutral">CV RMSE {formatNumber(activeModel.cv_rmse, 2)}</Chip>
                  <Chip tone={testGap > 0 ? "danger" : "success"}>Gap test-CV {formatNumber(testGap, 2)}</Chip>
                </div>
              </div>

              <LineChart
                labels={labels}
                series={[
                  { name: "GOR real", color: colors.blue, values: firstActual },
                  {
                    name: activeModel.label,
                    color: colors.accent2,
                    values: firstPredicted,
                  },
                ]}
                ariaLabel="Comparación entre GOR real y predicción del modelo"
                thresholds={[
                  { label: "Líquido", value: report.regime_thresholds.liquid, color: colors.accent },
                  { label: "Gas", value: report.regime_thresholds.gas, color: colors.danger },
                ]}
              />
            </div>

            <aside className="result-grid__side">
              <div className="info-card">
                <span className="info-card__eyebrow">Lectura rápida</span>
                <h3>Señal útil</h3>
                <p>
                  La web está pensada para que el operador vea si la presión superficial se parece más a un régimen líquido estable o a uno
                  con oscilaciones y spikes.
                </p>
              </div>

              <div className="info-card info-card--tight">
                <span className="info-card__eyebrow">Top features</span>
                <h3>Variables que más pesan</h3>
                <ul className="bullet-list">
                  {topFeatures.map((item) => (
                    <li key={item.feature}>
                      <strong>{item.feature}</strong>
                      <span>{formatNumber(item.importance, 3)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="info-card info-card--tight">
                <span className="info-card__eyebrow">Nota</span>
                <h3>XGBoost</h3>
                <p>{report.models.xgb.note}</p>
              </div>
            </aside>
          </div>
        </Panel>

        <Panel
          title="Evolución del GOR en el tiempo"
          subtitle="El gráfico superior muestra el GOR y los umbrales operativos; el inferior compara caudal de gas y líquido total."
        >
          <div className="panel__subhead">
            <div>
              <h3>GOR + caudales</h3>
              <p>
                El GOR medio es {formatNumber(report.dataset.gor_mean, 1)} m³/m³ y el máximo observado llega a {formatNumber(report.gor_stats.max, 1)} m³/m³.
              </p>
            </div>
            <div className="panel__chips">
              <Chip tone="neutral">Umbral líquido {report.regime_thresholds.liquid}</Chip>
              <Chip tone="danger">Umbral gas {report.regime_thresholds.gas}</Chip>
              <Chip tone="accent">Outliers {report.gor_stats.pct_outliers}</Chip>
            </div>
          </div>

          <LineChart
            labels={report.gor_series.map((row) => formatDateTime(row.date))}
            series={[
              { name: "GOR (m³/m³)", color: colors.accent, values: report.gor_series.map((row) => row.gor_m3_m3) },
            ]}
            thresholds={[
              { label: "Límite gas", value: report.regime_thresholds.gas, color: colors.danger },
              { label: "Límite líquido", value: report.regime_thresholds.liquid, color: colors.blue },
            ]}
            ariaLabel="Evolución temporal del GOR"
          />

          <div className="production-caption">
            <span>Distribución del GOR: mediana {formatNumber(report.dataset.gor_median, 1)} y desvío {formatNumber(report.dataset.gor_std, 1)}</span>
            <span>El crecimiento del GOR coincide con un régimen cada vez más gaseoso.</span>
          </div>

          <div className="panel__subhead panel__subhead--compact">
            <div>
              <h3>Caudal de gas y líquido total</h3>
              <p>
                {formatNumber(report.production_summary.gas_mean, 2)} m³/h de gas promedio frente a {formatNumber(report.production_summary.liquid_mean, 2)} m³/h de líquido promedio.
              </p>
            </div>
            <div className="panel__chips">
              <Chip tone="neutral">Ratio medio {formatNumber(report.production_summary.ratio_mean, 4)}</Chip>
              <Chip tone="accent">Ratio máximo {formatNumber(report.production_summary.ratio_max, 4)}</Chip>
            </div>
          </div>

          <LineChart
            labels={productionLabels}
            series={[
              { name: "Gas (m³/h)", color: colors.accent, values: gasSeries },
              { name: "Líquido total (m³/h)", color: colors.blue, values: liquidSeries },
            ]}
            ariaLabel="Evolución temporal del gas respecto del líquido total"
          />

          <div className="production-caption">
            <span>Relación gas/líquido en la ventana: {formatNumber(percentile(ratioSeries, 0.5), 4)} mediana</span>
            <span>Si la relación sube, el sistema se vuelve más gaseoso.</span>
          </div>
        </Panel>

        <section className="two-col">
          <Panel title="Histograma del GOR" subtitle="Distribución completa del target y separación entre zonas líquido, mixto y gas dominante.">
            <HistogramChart
              bins={report.gor_histogram}
              thresholds={[
                { label: "Líquido", value: report.regime_thresholds.liquid, color: colors.blue },
                { label: "Gas", value: report.regime_thresholds.gas, color: colors.danger },
              ]}
              ariaLabel="Histograma del GOR"
            />
          </Panel>

          <Panel title="Correlación features vs GOR" subtitle="Ranking de variables que mejor explican el target continuo antes del entrenamiento.">
            <HorizontalBarChart
              items={report.correlations_top.map((item) => ({
                label: item.feature,
                value: item.pearson_r,
              }))}
              ariaLabel="Correlación de Pearson entre features y GOR"
            />
          </Panel>
        </section>

        <section className="two-col">
          <Panel title="Importancia de variables" subtitle="Ranking de features para el modelo seleccionado, ordenadas por peso absoluto.">
            <BarList items={featureBars} />
          </Panel>

          <Panel title="Claves del proyecto" subtitle="Resumen de lo que hace interesante este problema físico y de modelado.">
            <div className="narrative">
              {report.narrative.map((line) => (
                <div key={line} className="narrative__item">
                  <span className="narrative__mark" />
                  <p>{line}</p>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="two-col">
          <Panel title="Ventana del dataset" subtitle="Información temporal y de cobertura para contextualizar la corrida.">
            <div className="timeline-card">
              <div className="timeline-card__row">
                <span>Inicio</span>
                <strong>{formatDate(report.dataset.date_min)}</strong>
              </div>
              <div className="timeline-card__row">
                <span>Fin</span>
                <strong>{formatDate(report.dataset.date_max)}</strong>
              </div>
              <div className="timeline-card__row">
                <span>GOR válido</span>
                <strong>{coverageLabel}</strong>
              </div>
              <div className="timeline-card__row">
                <span>Pozo / PAD</span>
                <strong>{report.dataset.well_count}</strong>
              </div>
            </div>
          </Panel>

          <Panel title="Umbrales operativos" subtitle="La capa visual separa el GOR continuo en tres regiones solo para lectura.">
            <div className="threshold-grid">
              <div className="threshold-grid__item">
                <span>Líquido dominante</span>
                <strong>&lt; {report.regime_thresholds.liquid}</strong>
              </div>
              <div className="threshold-grid__item">
                <span>Mixto</span>
                <strong>{report.regime_thresholds.liquid} - {report.regime_thresholds.gas}</strong>
              </div>
              <div className="threshold-grid__item">
                <span>Gas dominante</span>
                <strong>&gt;= {report.regime_thresholds.gas}</strong>
              </div>
            </div>
          </Panel>
        </section>
          </>
        )}
      </div>
    </main>
  );
}

export default App;
