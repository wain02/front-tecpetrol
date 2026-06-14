import { useEffect, useMemo, useState } from "react";
import { buildApiUrl, fetchJson } from "./presion-boca/api";

function downloadFile(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
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

    try {
      const params: Record<string, string> = { pad: selectedPad };
      if (selectedPozo) params.pozo = selectedPozo;

      const response = await fetch(buildApiUrl("/report/informe/pdf", params));

      if (!response.ok) {
        throw new Error(`No se pudo descargar el informe (${response.status})`);
      }

      const blob = await response.blob();
      const suffix = selectedPozo ? `${selectedPad}-${selectedPozo}` : selectedPad;
      downloadFile(blob, `informe-${suffix}.pdf`);
      setInfo(
        selectedPozo
          ? `Descargando informe del pozo ${selectedPozo} del PAD ${selectedPad}.`
          : `Descargando informe completo del PAD ${selectedPad}.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error descargando el informe");
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
          el backend debe devolver el informe completo del PAD.
        </p>

        <div className="docs__block">
          <h2>Uso</h2>
          <ol className="docs__list">
            <li>Elegí un <strong>PAD</strong>.</li>
            <li>Opcionalmente elegí un <strong>pozo</strong>.</li>
            <li>Hacé clic en <strong>Descargar PDF informe</strong>.</li>
            <li>El navegador descarga el PDF correspondiente a ese filtro.</li>
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
          {loading ? "Generando PDF..." : "Descargar PDF informe"}
        </button>
      </div>
    </section>
  );
}
