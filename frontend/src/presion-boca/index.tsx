import { useEffect, useMemo, useState } from "react";
import type { WellAnalysisRecord, ExtrapolationEvent, DensidadColumnaRecord } from "./types";
import { buildApiUrl, fetchJson } from "./api";
import { OverlayChart } from "./OverlayChart";
import { WellDetailChart } from "./WellDetailChart";
import { ExtrapolationTable } from "./ExtrapolationTable";
import { EventFitChart } from "./EventFitChart";
import { DensidadColumnaPanel } from "./DensidadColumnaPanel";

export function PresionBocaAnalysis() {
  const [pads, setPads] = useState<string[]>([]);
  const [padsLoading, setPadsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allData, setAllData] = useState<WellAnalysisRecord[]>([]);
  const [selectedPad, setSelectedPad] = useState<string>("");
  const [selectedPozo, setSelectedPozo] = useState<string>("");
  const [extrapolaciones, setExtrapolaciones] = useState<ExtrapolationEvent[]>([]);
  const [extrapLoading, setExtrapLoading] = useState(false);
  const [selectedEventTs, setSelectedEventTs] = useState<string | null>(null);
  const [densidadData, setDensidadData] = useState<DensidadColumnaRecord[]>([]);
  const [densidadLoading, setDensidadLoading] = useState(false);

  useEffect(() => {
    fetchJson<string[]>(buildApiUrl("/catalog/pads"))
      .then(setPads)
      .catch(() => setPads([]))
      .finally(() => setPadsLoading(false));
  }, []);

  useEffect(() => {
    setExtrapolaciones([]);
    setSelectedEventTs(null);
    if (!selectedPad || !selectedPozo) return;
    setExtrapLoading(true);
    fetchJson<ExtrapolationEvent[]>(
      buildApiUrl("/pressure-extrapolation/extrapolacion_eventos/produccion", {
        pad: selectedPad,
        pozo: selectedPozo,
      }),
    )
      .then(setExtrapolaciones)
      .catch(() => setExtrapolaciones([]))
      .finally(() => setExtrapLoading(false));
  }, [selectedPad, selectedPozo]);

  useEffect(() => {
    setDensidadData([]);
    if (!selectedPad || !selectedPozo) return;
    setDensidadLoading(true);
    fetchJson<DensidadColumnaRecord[]>(
      buildApiUrl("/pressure-analysis/densidad_columna", { pad: selectedPad, pozo: selectedPozo }),
    )
      .then(setDensidadData)
      .catch(() => setDensidadData([]))
      .finally(() => setDensidadLoading(false));
  }, [selectedPad, selectedPozo]);

  const pozos = useMemo(() => Array.from(new Set(allData.map((r) => r.pozo_id))).sort(), [allData]);

  const displayData = useMemo(
    () => (selectedPozo ? allData.filter((r) => r.pozo_id === selectedPozo) : allData),
    [allData, selectedPozo],
  );

  const handlePadChange = async (pad: string) => {
    setSelectedPad(pad);
    setSelectedPozo("");
    setAllData([]);
    setError(null);
    if (!pad) return;
    setLoading(true);
    try {
      const result = await fetchJson<WellAnalysisRecord[]>(
        buildApiUrl("/well-analysis/presion_boca", { pad }),
      );
      setAllData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  const selectedEvent = useMemo(
    () => extrapolaciones.find((e) => e.timestamp_evento === selectedEventTs) ?? null,
    [extrapolaciones, selectedEventTs],
  );

  const hasData = !loading && selectedPad && allData.length > 0;

  return (
    <section className="pba-view">
      <div className="pba-filters">
        <div className="pba-filter">
          <label className="pba-filter__label" htmlFor="pba-pad">
            PAD
          </label>
          <select
            id="pba-pad"
            className="pba-select"
            value={selectedPad}
            onChange={(e) => handlePadChange(e.target.value)}
            disabled={padsLoading}
          >
            <option value="">{padsLoading ? "Cargando PADs…" : "Seleccioná un PAD"}</option>
            {pads.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <div className="pba-filter">
          <label className="pba-filter__label" htmlFor="pba-pozo">
            Pozo
          </label>
          <select
            id="pba-pozo"
            className="pba-select"
            value={selectedPozo}
            onChange={(e) => setSelectedPozo(e.target.value)}
            disabled={!hasData}
          >
            <option value="">Todos los pozos</option>
            {pozos.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="upload__status upload__status--error">{error}</div> : null}
      {loading ? <div className="loading-card">Cargando datos de presión…</div> : null}

      {hasData ? (
        <div className="pba-chart-panel">
          <div className="pba-chart-header">
            <div>
              <h3>{selectedPad}</h3>
              <p>
                {selectedPozo
                  ? `${selectedPozo} — ${displayData.length} registros`
                  : `${pozos.length} pozos — ${displayData.length} registros`}
              </p>
            </div>
          </div>

          {selectedPozo ? (
            <>
              <div className="pba-chart-section">
                <WellDetailChart data={displayData} />
              </div>

              <div className="pba-section-divider">
                <span>Extrapolación por apertura</span>
              </div>

              <div className="pba-chart-section">
                {extrapLoading ? (
                  <div className="loading-card">Cargando extrapolaciones…</div>
                ) : (
                  <>
                    <ExtrapolationTable
                      events={extrapolaciones}
                      selectedTs={selectedEventTs}
                      onSelect={(ts) => setSelectedEventTs((prev) => (prev === ts ? null : ts))}
                    />
                    {selectedEvent ? (
                      <div className="pba-chart-section pba-chart-section--inner">
                        <EventFitChart event={selectedEvent} />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="pba-section-divider">
                <span>Densidad de columna</span>
              </div>

              <div className="pba-chart-section">
                {densidadLoading ? (
                  <div className="loading-card">Cargando datos de densidad…</div>
                ) : densidadData.length > 0 ? (
                  <DensidadColumnaPanel data={densidadData} />
                ) : (
                  <div className="loading-card">Sin datos de densidad para este pozo.</div>
                )}
              </div>
            </>
          ) : (
            <OverlayChart data={displayData} />
          )}
        </div>
      ) : null}

      {!loading && !hasData && !error ? (
        <div className="loading-card">Seleccioná un PAD para cargar los datos.</div>
      ) : null}
    </section>
  );
}
