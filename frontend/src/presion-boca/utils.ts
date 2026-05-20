export function cx(...items: Array<string | false | null | undefined>): string {
  return items.filter(Boolean).join(" ");
}

export function formatEventDate(value: string): string {
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

export const WELL_COLORS = [
  "#0f9a4c", "#0d6fd6", "#e07b00", "#9333ea", "#0891b2", "#be185d", "#059669", "#d97706",
];

export function downloadSvg(svgEl: SVGSVGElement, filename: string) {
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
