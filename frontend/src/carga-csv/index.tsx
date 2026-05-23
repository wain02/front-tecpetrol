import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

function cx(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(" ");
}

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
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

type WellMapping = {
  presion_boca_psi: string;
  presion_anular_psi: string;
  orificio_mm: string;
  temperatura_boca_c: string;
  densidad_agua_kg_l: string;
  cloro_agua_g_l: string;
  solidos_kg_hora: string;
  solidos_l_hora: string;
  solidos_acum_kg: string;
};

const EMPTY_MAPPING: WellMapping = {
  presion_boca_psi: "",
  presion_anular_psi: "",
  orificio_mm: "",
  temperatura_boca_c: "",
  densidad_agua_kg_l: "",
  cloro_agua_g_l: "",
  solidos_kg_hora: "",
  solidos_l_hora: "",
  solidos_acum_kg: "",
};

const COLUMNS_LIST_ID = "csv-columns-list";

const WELL_FIELDS: Array<{ key: keyof WellMapping; label: string }> = [
  { key: "presion_boca_psi", label: "presion_boca_psi (Presion Boca)" },
  { key: "presion_anular_psi", label: "presion_anular_psi (Presion Anular)" },
  { key: "orificio_mm", label: "orificio_mm (Orificio)" },
  { key: "temperatura_boca_c", label: "temperatura_boca_c (Temperatura)" },
  { key: "densidad_agua_kg_l", label: "densidad_agua_kg_l (Densidad AGUA)" },
  { key: "cloro_agua_g_l", label: "cloro_agua_g_l (CLORO)" },
  { key: "solidos_kg_hora", label: "solidos_kg_hora (Solidos kg/hora)" },
  { key: "solidos_l_hora", label: "solidos_l_hora (Solidos lts/hora)" },
  { key: "solidos_acum_kg", label: "solidos_acum_kg (Acumulado Solidos)" },
];

export function CargaCsv() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [metadataFile, setMetadataFile] = useState<File | null>(null);
  const [uploadStep, setUploadStep] = useState<"select" | "form">("select");
  const [wellCount, setWellCount] = useState("1");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [wellMappings, setWellMappings] = useState<WellMapping[]>([{ ...EMPTY_MAPPING }]);

  const updateWellCount = (value: number) => {
    const safeValue = Math.min(3, Math.max(1, value));
    setWellCount(String(safeValue));
    setWellMappings((prev) => {
      const next = [...prev];
      while (next.length < safeValue) next.push({ ...EMPTY_MAPPING });
      return next.slice(0, safeValue);
    });
  };

  const handleSubmitConfig = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    const parsedWellCount = Math.max(1, Number(wellCount) || 1);

    const config = {
      datos: {
        sheet: "",
        header_rows: 1,
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
        sheet: "",
        header_rows: 1,
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

      setSubmitSuccess("Archivos y configuracion subidos correctamente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al enviar configuracion";
      console.error("Supabase upload error", message);
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (uploadStep === "select") {
    return (
      <section className="upload">
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
                if (file && metadataFile) setUploadStep("form");
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
          <p className="upload__note">Subi el archivo de presiones de fondo en formato Excel para habilitar la carga.</p>
          <label className="upload__drop upload__drop--secondary">
            <input
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setMetadataFile(file);
                if (file && selectedFile) setUploadStep("form");
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
      </section>
    );
  }

  return (
    <section className="upload">
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
                className={cx("stepper__dot", Number(wellCount) === step && "stepper__dot--active")}
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
              {WELL_FIELDS.map((field) => (
                <label key={`${field.key}-${wellIndex}`} className="form__field">
                  <span>{field.label}</span>
                  <input
                    type="text"
                    list={COLUMNS_LIST_ID}
                    placeholder="Escribir y seleccionar"
                    value={mapping[field.key]}
                    onChange={(event) =>
                      setWellMappings((prev) =>
                        prev.map((item, index) =>
                          index === wellIndex ? { ...item, [field.key]: event.target.value } : item,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        ))}

        <datalist id={COLUMNS_LIST_ID}>
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
    </section>
  );
}
