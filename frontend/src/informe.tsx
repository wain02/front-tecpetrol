import { useEffect, useState } from "react";
import { buildApiUrl, fetchJson } from "./presion-boca/api";

type InformeReport = {
  pad: string;
  pozo: string | null;
  estado_inicial?: {
    estado: string;
    densidad_prom_columna: number | null;
    fecha_medicion: string | null;
  } | null;
  datos_pad?: unknown[];
  features_pad?: unknown[];
  features_individuales?: unknown[] | null;
};

type PdfPage = string[];
type ReportBlock =
  | { kind: "title"; text: string }
  | { kind: "section"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" };

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function toAscii(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function stripMarkdown(text: string): string {
  return toAscii(text)
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .trim();
}

function parseReportMarkdown(text: string): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const lines = toAscii(text).replace(/\r/g, "").split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      blocks.push({ kind: "blank" });
      continue;
    }

    if (line.startsWith("# ")) {
      blocks.push({ kind: "title", text: stripMarkdown(line.slice(2)) });
      continue;
    }

    if (line.startsWith("## ")) {
      blocks.push({ kind: "section", text: stripMarkdown(line.slice(3)) });
      continue;
    }

    if (line.startsWith("- ")) {
      blocks.push({ kind: "bullet", text: stripMarkdown(line.slice(2)) });
      continue;
    }

    blocks.push({ kind: "text", text: stripMarkdown(line) });
  }

  return blocks;
}

function wrapBlockText(text: string, limit = 92): string[] {
  const cleaned = stripMarkdown(text);
  const words = cleaned.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function splitIntoPages(lines: string[], linesPerPage = 42): PdfPage[] {
  const pages: PdfPage[] = [];
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }
  return pages.length > 0 ? pages : [[]];
}

function buildPdfBlob(title: string, bodyText: string): Blob {
  const header = "%PDF-1.4\n";
  const blocks = parseReportMarkdown(bodyText);
  const lines: Array<{ text: string; kind: ReportBlock["kind"] }> = [];

  for (const block of blocks) {
    if (block.kind === "blank") {
      lines.push({ text: "", kind: "blank" });
      continue;
    }

    const limit = block.kind === "title" ? 72 : block.kind === "section" ? 78 : 92;
    const wrapped = wrapBlockText(block.text, limit);
    wrapped.forEach((line, idx) => {
      lines.push({ text: line, kind: idx === 0 ? block.kind : "text" });
    });
  }

  const pages = splitIntoPages(lines.map((line) => line.text));
  const objects: string[] = [];
  const pageObjectNumbers: number[] = [];
  const fontObjectNumber = 3 + pages.length * 2;
  const pagesObjectNumber = 2 + pages.length * 2;
  const catalogObjectNumber = 1;

  objects.push(
    `${catalogObjectNumber} 0 obj\n<< /Type /Catalog /Pages ${pagesObjectNumber} 0 R >>\nendobj\n`,
  );

  const pageContentObjectNumbers: number[] = [];
  let objectNumber = 2;

  for (const page of pages) {
    const pageIndex = pages.indexOf(page);
    const contentObjectNumber = objectNumber;
    const pageObjectNumber = objectNumber + 1;
    pageContentObjectNumbers.push(contentObjectNumber);
    pageObjectNumbers.push(pageObjectNumber);

    const contentLines = [
      "BT",
      "/F1 11 Tf",
      "50 800 Td",
      `(${escapePdfText(toAscii(title))}) Tj`,
      "0 -20 Td",
    ];

    const pageLines = blocksForPage(lines, pageIndex, pages.length);

    for (const entry of pageLines) {
      if (entry.kind === "blank") {
        contentLines.push("0 -10 Td");
        continue;
      }

      if (entry.kind === "title") {
        contentLines.push("/F1 16 Tf");
        contentLines.push("0 -4 Td");
      } else if (entry.kind === "section") {
        contentLines.push("/F1 12 Tf");
        contentLines.push("0 -2 Td");
      } else if (entry.kind === "bullet") {
        contentLines.push("/F1 10 Tf");
      } else {
        contentLines.push("/F1 10 Tf");
      }

      const prefix = entry.kind === "bullet" ? "- " : "";
      const safeLine = escapePdfText(toAscii(`${prefix}${entry.text}` || " "));
      contentLines.push(`(${safeLine}) Tj`);
      contentLines.push(entry.kind === "title" ? "0 -20 Td" : entry.kind === "section" ? "0 -14 Td" : "0 -12 Td");
    }

    contentLines.push("ET");
    const contentStream = contentLines.join("\n");

    objects.push(
      `${contentObjectNumber} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    );

    objects.push(
      `${pageObjectNumber} 0 obj\n<< /Type /Page /Parent ${pagesObjectNumber} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>\nendobj\n`,
    );

    objectNumber += 2;
  }

  const kids = pageObjectNumbers.map((n) => `${n} 0 R`).join(" ");
  objects.push(
    `${pagesObjectNumber} 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${pageObjectNumbers.length} >>\nendobj\n`,
  );
  objects.push(
    `${fontObjectNumber} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`,
  );

  let offset = header.length;
  const xrefOffsets = [0];
  for (const obj of objects) {
    xrefOffsets.push(offset);
    offset += obj.length;
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (const objOffset of xrefOffsets.slice(1)) {
    xref += `${String(objOffset).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjectNumber} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const pdf = header + objects.join("") + xref + trailer;
  return new Blob([pdf], { type: "application/pdf" });
}

function blocksForPage(
  lines: Array<{ text: string; kind: ReportBlock["kind"] }>,
  pageIndex: number,
  totalPages: number,
): Array<{ text: string; kind: ReportBlock["kind"] }> {
  const linesPerPage = 42;
  const start = pageIndex * linesPerPage;
  const end = start + linesPerPage;
  return lines.slice(start, end);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

function safeName(value: string | null) {
  return value ? value.replace(/\s+/g, "_") : "sin_pozo";
}

export function Informe() {
  const [pads, setPads] = useState<string[]>([]);
  const [padsLoading, setPadsLoading] = useState(true);
  const [pozos, setPozos] = useState<string[]>([]);
  const [pozosLoading, setPozosLoading] = useState(false);
  const [selectedPad, setSelectedPad] = useState<string>("");
  const [selectedPozo, setSelectedPozo] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reportText, setReportText] = useState<string>("");

  useEffect(() => {
    fetchJson<string[]>(buildApiUrl("/catalog/pads"))
      .then(setPads)
      .catch(() => setPads([]))
      .finally(() => setPadsLoading(false));
  }, []);

  useEffect(() => {
    setPozos([]);
    setSelectedPozo("");
    if (!selectedPad) return;
    setPozosLoading(true);
    fetchJson<string[]>(buildApiUrl(`/catalog/pads/${selectedPad}/pozos`))
      .then(setPozos)
      .catch(() => setPozos([]))
      .finally(() => setPozosLoading(false));
  }, [selectedPad]);

  const handleDownload = async () => {
    if (!selectedPad) {
      setError("Seleccioná un PAD antes de descargar el informe.");
      return;
    }

    setLoading(true);
    setError(null);
    setInfo(null);
    setReportText("");

    try {
      const params: Record<string, string> = { pad: selectedPad };
      if (selectedPozo) params.pozo = selectedPozo;

      const response = await fetch(buildApiUrl("/reporte/informe", params));
      if (!response.ok) {
        throw new Error(`No se pudo obtener el informe (${response.status})`);
      }

      const payload = await response.text();
      setReportText(payload);
      const title = selectedPozo
        ? `Informe ${selectedPad} - ${selectedPozo}`
        : `Informe completo ${selectedPad}`;
      const pdfBlob = buildPdfBlob(title, payload);
      const filename = `informe-${safeName(selectedPad)}${selectedPozo ? `-${safeName(selectedPozo)}` : ""}.pdf`;

      downloadBlob(pdfBlob, filename);
      setInfo(
        selectedPozo
          ? `Informe generado para el pozo ${selectedPozo} del PAD ${selectedPad}.`
          : `Informe generado para el PAD completo ${selectedPad}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error generando el informe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="upload">
      <div className="upload__card upload__card--wide">
        <h1>Informe</h1>
        <p>
          Seleccioná un PAD obligatorio y, si querés un informe puntual, elegí también un pozo. Si no elegís pozo,
          el reporte se genera para todo el PAD.
        </p>

        <div className="docs__block">
          <h2>Uso</h2>
          <ol className="docs__list">
            <li>Elegí un <strong>PAD</strong>.</li>
            <li>Opcionalmente elegí un <strong>pozo</strong>.</li>
            <li>Hacé clic en <strong>Descargar PDF informe</strong>.</li>
            <li>El front pide los datos al backend y arma el PDF localmente.</li>
          </ol>
        </div>

        <div className="pba-filters">
          <div className="pba-filter">
            <label className="pba-filter__label" htmlFor="informe-pad">
              PAD
            </label>
            <select
              id="informe-pad"
              className="pba-select"
              value={selectedPad}
              onChange={(e) => setSelectedPad(e.target.value)}
              disabled={padsLoading}
            >
              <option value="">{padsLoading ? "Cargando PADs…" : "Seleccioná un PAD"}</option>
              {pads.map((pad) => (
                <option key={pad} value={pad}>
                  {pad}
                </option>
              ))}
            </select>
          </div>

          <div className="pba-filter">
            <label className="pba-filter__label" htmlFor="informe-pozo">
              Pozo
            </label>
            <select
              id="informe-pozo"
              className="pba-select"
              value={selectedPozo}
              onChange={(e) => setSelectedPozo(e.target.value)}
              disabled={!selectedPad || pozosLoading}
            >
              <option value="">{pozosLoading ? "Cargando pozos…" : "Todos los pozos"}</option>
              {pozos.map((pozo) => (
                <option key={pozo} value={pozo}>
                  {pozo}
                </option>
              ))}
            </select>
          </div>
        </div>

        {info ? <div className="upload__status upload__status--success">{info}</div> : null}
        {error ? <div className="upload__status upload__status--error">{error}</div> : null}

        <button type="button" className="upload__action" onClick={handleDownload} disabled={loading || !selectedPad}>
          {loading ? "Generando informe..." : "Descargar PDF informe"}
        </button>

        {reportText ? (
          <div className="docs__block">
            <h2>Vista previa del contenido</h2>
            <pre className="docs__code">{reportText}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
