export function cx(...items: Array<string | false | null | undefined>): string {
  return items.filter(Boolean).join(" ");
}

export function formatDateTime(value: string): string {
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

export function formatDT(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function cycleDurationHours(t_inicio: string, t_fin: string): number {
  return (new Date(t_fin).getTime() - new Date(t_inicio).getTime()) / 3_600_000;
}

export const CLUSTER_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#10b981",
  "#ef4444",
  "#06b6d4",
];

export const POZO_COLORS = [
  "#3b82f6",
  "#f87171",
  "#4ade80",
  "#fbbf24",
  "#a78bfa",
  "#34d399",
  "#fb923c",
  "#60a5fa",
];

// ── Lightweight 2-component PCA ──────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}

function matVec(M: number[][], v: number[]): number[] {
  return M.map((row) => dot(row, v));
}

function norm(v: number[]): number {
  return Math.sqrt(dot(v, v));
}

function normalize(v: number[]): number[] {
  const n = norm(v);
  return n < 1e-12 ? v.map(() => 0) : v.map((x) => x / n);
}

function powerIterate(M: number[][], seed: number[], iters = 200): number[] {
  let v = normalize(seed);
  for (let i = 0; i < iters; i++) v = normalize(matVec(M, v));
  return v;
}

export function pca2d(rawRows: number[][]): Array<[number, number]> {
  const n = rawRows.length;
  if (n < 2) return rawRows.map(() => [0, 0]);
  const p = rawRows[0].length;

  const means = Array.from({ length: p }, (_, j) =>
    rawRows.reduce((s, r) => s + r[j], 0) / n,
  );
  const stds = Array.from({ length: p }, (_, j) => {
    const m = means[j];
    return Math.sqrt(rawRows.reduce((s, r) => s + (r[j] - m) ** 2, 0) / n) || 1;
  });

  const Z = rawRows.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));

  const cov = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) =>
      Z.reduce((s, r) => s + r[i] * r[j], 0) / (n - 1),
    ),
  );

  const seed1 = Array.from({ length: p }, (_, i) => (i === 0 ? 1 : 0.01));
  const ev1 = powerIterate(cov, seed1);
  const lambda1 = dot(ev1, matVec(cov, ev1));

  const cov2 = cov.map((row, i) => row.map((v, j) => v - lambda1 * ev1[i] * ev1[j]));
  const seed2 = Array.from({ length: p }, (_, i) => (i === 1 ? 1 : 0.01));
  const ev2 = powerIterate(cov2, seed2);

  return Z.map((r) => [dot(r, ev1), dot(r, ev2)]);
}
