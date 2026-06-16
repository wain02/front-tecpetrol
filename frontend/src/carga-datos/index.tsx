import { useEffect, useState } from "react";
import { buildApiUrl } from "../presion-boca/api";

function cx(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(" ");
}

function FileIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function downloadFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

type DatosResult = {
  pad_id: string;
  pozos_procesados: number;
  registros_datos_ind: number;
  registros_datos_pad: number;
  registros_features_ind: number;
  registros_features_pad: number;
  segmentos_nuevos: number;
};

type MetadataResult = {
  pad_id: string;
  registros_metadata: number;
};

export function CargaDatos() {
  const [cantidad, setCantidad] = useState(3);
  const [nombres, setNombres] = useState<string[]>(["Pozo1", "Pozo2", "Pozo3"]);
  const [padId, setPadId] = useState("PAD_sintetico_3P");

  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [loadingMetadataTemplate, setLoadingMetadataTemplate] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateSuccess, setTemplateSuccess] = useState<string | null>(null);

  const [datosXlsx, setDatosXlsx] = useState<File | null>(null);
  const [submittingDatos, setSubmittingDatos] = useState(false);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const [resultDatos, setResultDatos] = useState<DatosResult | null>(null);

  const [metadataXlsx, setMetadataXlsx] = useState<File | null>(null);
  const [submittingMetadata, setSubmittingMetadata] = useState(false);
  const [errorMetadata, setErrorMetadata] = useState<string | null>(null);
  const [resultMetadata, setResultMetadata] = useState<MetadataResult | null>(null);

  useEffect(() => {
    setNombres((prev) => {
      const next = prev.slice(0, cantidad);
      while (next.length < cantidad) next.push(`Pozo${next.length + 1}`);
      return next;
    });
  }, [cantidad]);

  const handleNombreChange = (index: number, value: string) => {
    setNombres((prev) => prev.map((item, i) => (i === index ? value : item)));
  };

  const handleDownloadTemplate = async () => {
    setLoadingTemplate(true);
    setTemplateError(null);
    setTemplateSuccess(null);
    try {
      const response = await fetch(buildApiUrl("/template/template-datos-pozo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad, nombres }),
      });
      if (!response.ok) throw new Error(`No se pudo generar el template de datos (${response.status})`);
      downloadFile(await response.blob(), "template.xlsx");
      setTemplateSuccess("Template de datos descargado.");
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Error descargando template de datos");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const handleDownloadMetadataTemplate = async () => {
    setLoadingMetadataTemplate(true);
    setTemplateError(null);
    setTemplateSuccess(null);
    try {
      const response = await fetch(buildApiUrl("/template/template-metadata"));
      if (!response.ok) throw new Error(`No se pudo generar el template de metadata (${response.status})`);
      downloadFile(await response.blob(), "template_metadata.xlsx");
      setTemplateSuccess("Template de metadata descargado.");
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "Error descargando template de metadata");
    } finally {
      setLoadingMetadataTemplate(false);
    }
  };

  const handleSubmitDatos = async () => {
    if (!datosXlsx) return;
    setSubmittingDatos(true);
    setErrorDatos(null);
    setResultDatos(null);
    try {
      const formData = new FormData();
      formData.append("pad_id", padId);
      formData.append("nombres_pozos", nombres.join(","));
      formData.append("datos_xlsx", datosXlsx);
      const response = await fetch(buildApiUrl("/ingest/datos"), { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail ?? `Error ${response.status}`);
      setResultDatos(payload as DatosResult);
    } catch (err) {
      setErrorDatos(err instanceof Error ? err.message : "Error enviando archivo de datos");
    } finally {
      setSubmittingDatos(false);
    }
  };

  const handleSubmitMetadata = async () => {
    if (!metadataXlsx) return;
    setSubmittingMetadata(true);
    setErrorMetadata(null);
    setResultMetadata(null);
    try {
      const formData = new FormData();
      formData.append("pad_id", padId);
      formData.append("metadata_xlsx", metadataXlsx);
      const response = await fetch(buildApiUrl("/ingest/metadata"), { method: "POST", body: formData });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.detail ?? `Error ${response.status}`);
      setResultMetadata(payload as MetadataResult);
    } catch (err) {
      setErrorMetadata(err instanceof Error ? err.message : "Error enviando archivo de metadata");
    } finally {
      setSubmittingMetadata(false);
    }
  };

  return (
    <section className="upload">
      <div className="upload__card upload__card--wide">
        <h1>Carga de Archivos</h1>

        {/* ── Paso 1: Generar templates ─────────────────────────────── */}
        <div className="upload__step">
          <div className="upload__step-header">
            <span className="upload__step-badge">1</span>
            <div>
              <p className="upload__step-title">Preparar templates</p>
              <p className="upload__step-desc">
                Definí los pozos y descargá los Excel para completar. Los nombres que ingreses
                van a ser las columnas del template.
              </p>
            </div>
          </div>

          <div className="upload__form-head">
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
            <p className="upload__note">
              Tienen que coincidir exactamente con los encabezados del Excel que vas a subir en el Paso 2.
            </p>
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
            <button type="button" className={cx("upload__action")} onClick={handleDownloadMetadataTemplate} disabled={loadingMetadataTemplate}>
              {loadingMetadataTemplate ? "Generando..." : "Descargar template de metadata"}
            </button>
          </div>

          {templateError ? <div className="upload__status upload__status--error">{templateError}</div> : null}
          {templateSuccess ? <div className="upload__status upload__status--success">{templateSuccess}</div> : null}
        </div>

        <div className="upload__divider" />

        {/* ── Paso 2: Cargar archivos ───────────────────────────────── */}
        <div className="upload__step">
          <div className="upload__step-header">
            <span className="upload__step-badge">2</span>
            <div>
              <p className="upload__step-title">Cargar archivos completados</p>
              <p className="upload__step-desc">
                Los dos archivos se cargan de forma independiente. Podés subir uno sin el otro.
              </p>
            </div>
          </div>

          <div className="form__field">
            <span>PAD ID</span>
            <input
              type="text"
              value={padId}
              onChange={(event) => setPadId(event.target.value)}
              placeholder="PAD_sintetico_3P"
              style={{ maxWidth: 320 }}
            />
          </div>

          {/* Datos */}
          <div className="upload__ingest-block">
            <label className={`upload__drop${datosXlsx ? " upload__drop--selected" : ""}`}>
              <input
                type="file"
                accept=".xlsx"
                onChange={(event) => { setDatosXlsx(event.target.files?.[0] ?? null); setResultDatos(null); setErrorDatos(null); }}
              />
              {datosXlsx ? (
                <>
                  <FileIcon />
                  <span className="upload__file-name">{datosXlsx.name}</span>
                  <span className="upload__hint">{(datosXlsx.size / 1024).toFixed(1)} KB · click para cambiar</span>
                </>
              ) : (
                <>
                  <span className="upload__title">Subir archivo de datos</span>
                  <span className="upload__hint">Elegí el archivo generado desde el template de datos</span>
                </>
              )}
            </label>

            {errorDatos ? <div className="upload__status upload__status--error">{errorDatos}</div> : null}

            {resultDatos ? (
              <div className="upload__result">
                <span className="upload__result-title">Datos procesados correctamente</span>
                <div className="upload__result-grid">
                  <span>Pozos procesados</span><strong>{resultDatos.pozos_procesados}</strong>
                  <span>Registros datos (ind)</span><strong>{resultDatos.registros_datos_ind.toLocaleString("es-AR")}</strong>
                  <span>Registros datos (PAD)</span><strong>{resultDatos.registros_datos_pad.toLocaleString("es-AR")}</strong>
                  <span>Features (ind)</span><strong>{resultDatos.registros_features_ind.toLocaleString("es-AR")}</strong>
                  <span>Features (PAD)</span><strong>{resultDatos.registros_features_pad.toLocaleString("es-AR")}</strong>
                  <span>Segmentos nuevos</span><strong>{resultDatos.segmentos_nuevos}</strong>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="upload__action"
              onClick={handleSubmitDatos}
              disabled={submittingDatos || !datosXlsx}
            >
              {submittingDatos ? "Enviando..." : "Procesar datos"}
            </button>
          </div>

          <div className="upload__divider" />

          {/* Metadata */}
          <div className="upload__ingest-block">
            <label className={`upload__drop upload__drop--secondary${metadataXlsx ? " upload__drop--selected" : ""}`}>
              <input
                type="file"
                accept=".xlsx"
                onChange={(event) => { setMetadataXlsx(event.target.files?.[0] ?? null); setResultMetadata(null); setErrorMetadata(null); }}
              />
              {metadataXlsx ? (
                <>
                  <FileIcon />
                  <span className="upload__file-name">{metadataXlsx.name}</span>
                  <span className="upload__hint">{(metadataXlsx.size / 1024).toFixed(1)} KB · click para cambiar</span>
                </>
              ) : (
                <>
                  <span className="upload__title">Subir archivo de metadata (opcional)</span>
                  <span className="upload__hint">Elegí el archivo generado desde el template de metadata</span>
                </>
              )}
            </label>

            {errorMetadata ? <div className="upload__status upload__status--error">{errorMetadata}</div> : null}

            {resultMetadata ? (
              <div className="upload__result">
                <span className="upload__result-title">Metadata procesada correctamente</span>
                <div className="upload__result-grid">
                  <span>Registros metadata</span><strong>{resultMetadata.registros_metadata}</strong>
                </div>
              </div>
            ) : null}

            <button
              type="button"
              className="upload__action"
              onClick={handleSubmitMetadata}
              disabled={submittingMetadata || !metadataXlsx}
            >
              {submittingMetadata ? "Enviando..." : "Procesar metadata"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
