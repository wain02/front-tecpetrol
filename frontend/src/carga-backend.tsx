import { useEffect, useState } from "react";
import { buildApiUrl } from "./presion-boca/api";

function cx(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(" ");
}

function downloadFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export function CargaBackend() {
  const [cantidad, setCantidad] = useState(3);
  const [nombres, setNombres] = useState<string[]>(["Pozo1", "Pozo2", "Pozo3"]);
  const [padId, setPadId] = useState("PAD_sintetico_3P");
  const [datosXlsx, setDatosXlsx] = useState<File | null>(null);
  const [metadataXlsx, setMetadataXlsx] = useState<File | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingMetadataTemplate, setLoadingMetadataTemplate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setNombres((prev) => {
      const next = prev.slice(0, cantidad);
      while (next.length < cantidad) {
        next.push(`Pozo${next.length + 1}`);
      }
      return next;
    });
  }, [cantidad]);

  const handleNombreChange = (index: number, value: string) => {
    setNombres((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const handleDownloadTemplate = async () => {
    setLoadingTemplate(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(buildApiUrl("/template/template-datos-pozo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad, nombres }),
      });

      if (!response.ok) {
        throw new Error(`No se pudo generar el template de datos (${response.status})`);
      }

      const blob = await response.blob();
      downloadFile(blob, "template.xlsx");
      setSuccess("Template de datos descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error descargando template de datos");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleDownloadMetadataTemplate = async () => {
    setLoadingMetadataTemplate(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(buildApiUrl("/template/template-metadata"));

      if (!response.ok) {
        throw new Error(`No se pudo generar el template de metadata (${response.status})`);
      }

      const blob = await response.blob();
      downloadFile(blob, "template_metadata.xlsx");
      setSuccess("Template de metadata descargado.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error descargando template de metadata");
    } finally {
      setLoadingMetadataTemplate(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!datosXlsx || !metadataXlsx) {
        throw new Error("Tenés que subir los dos archivos XLSX completados.");
      }

      const formData = new FormData();
      formData.append("pad_id", padId);
      formData.append("nombres_pozos", nombres.join(","));
      formData.append("datos_xlsx", datosXlsx);
      formData.append("metadata_xlsx", metadataXlsx);

      const response = await fetch(buildApiUrl("/ingest/datos"), {
        method: "POST",
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const detail = payload?.detail ?? `Error ${response.status}`;
        throw new Error(detail);
      }

      setSuccess("Archivos enviados correctamente al backend.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error enviando archivos");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="upload">
      <div className="upload__card upload__card--wide">
        <h1>Carga de Archivos</h1>
        <p>
          Generá las plantillas desde el backend, completalas en Excel y luego subí los archivos terminados para
          procesarlos.
        </p>

        <div className="upload__form-head">
          <div className="form__field">
            <span>PAD ID</span>
            <input
              type="text"
              value={padId}
              onChange={(event) => setPadId(event.target.value)}
              placeholder="PAD_sintetico_3P"
            />
          </div>

          <div className="form__field">
            <span>Cantidad de pozos</span>
            <input
              type="number"
              min={1}
              max={10}
              value={cantidad}
              onChange={(event) => setCantidad(Math.max(1, Number(event.target.value) || 1))}
            />
          </div>
        </div>

        <div className="form__field">
          <span>Nombres de pozos</span>
          <div className="form__grid">
            {nombres.map((nombre, index) => (
              <label className="form__field" key={`${index}-${nombre}`}>
                <span>Pozo {index + 1}</span>
                <input
                  type="text"
                  value={nombre}
                  onChange={(event) => handleNombreChange(index, event.target.value)}
                  placeholder={`Pozo${index + 1}`}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="upload__actions" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="upload__action" onClick={handleDownloadTemplate} disabled={loadingTemplate}>
            {loadingTemplate ? "Generando..." : "Descargar template de datos"}
          </button>
          <button
            type="button"
            className={cx("upload__action")}
            onClick={handleDownloadMetadataTemplate}
            disabled={loadingMetadataTemplate}
          >
            {loadingMetadataTemplate ? "Generando..." : "Descargar template de metadata"}
          </button>
        </div>

        <div className="upload__divider" />

        <label className="upload__drop">
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => setDatosXlsx(event.target.files?.[0] ?? null)}
          />
          <span className="upload__title">Subir datos_xlsx completado</span>
          <span className="upload__hint">{datosXlsx ? datosXlsx.name : "Elegí el archivo generado desde el template de datos"}</span>
        </label>

        <label className="upload__drop upload__drop--secondary">
          <input
            type="file"
            accept=".xlsx"
            onChange={(event) => setMetadataXlsx(event.target.files?.[0] ?? null)}
          />
          <span className="upload__title">Subir metadata_xlsx completado</span>
          <span className="upload__hint">
            {metadataXlsx ? metadataXlsx.name : "Elegí el archivo generado desde el template de metadata"}
          </span>
        </label>

        {error ? <div className="upload__status upload__status--error">{error}</div> : null}
        {success ? <div className="upload__status upload__status--success">{success}</div> : null}

        <button type="button" className="upload__action" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Enviando..." : "Procesar archivos en el backend"}
        </button>
      </div>
    </section>
  );
}
