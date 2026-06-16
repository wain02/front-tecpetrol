import { useEffect, useMemo, useState } from "react";
import type { WellAnalysisRecord, ExtrapolationEvent, PreAperturaEvent, DensidadColumnaRecord, GorEvolutionRecord } from "./types";
import { buildApiUrl, fetchJson } from "./api";
import { OverlayChart } from "./OverlayChart";
import { WellDetailChart } from "./WellDetailChart";
import { ExtrapolationTable } from "./ExtrapolationTable";
import { EventFitChart } from "./EventFitChart";
import { PreAperturaTable } from "./PreAperturaTable";
import { PreAperturaFitChart } from "./PreAperturaFitChart";
import { DensidadColumnaPanel } from "./DensidadColumnaPanel";
import { GorEvolutionPanel } from "./GorEvolutionPanel";

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
  const [extrapRefreshKey, setExtrapRefreshKey] = useState(0);
  const [selectedEventTs, setSelectedEventTs] = useState<string | null>(null);
  const [preAperturaEvents, setPreAperturaEvents] = useState<PreAperturaEvent[]>([]);
  const [preAperturaLoading, setPreAperturaLoading] = useState(false);
  const [preAperturaRefreshKey, setPreAperturaRefreshKey] = useState(0);
  const [selectedPreAperturaTs, setSelectedPreAperturaTs] = useState<string | null>(null);
  const [densidadData, setDensidadData] = useState<DensidadColumnaRecord[]>([]);
  const [densidadLoading, setDensidadLoading] = useState(false);
  const [gorData, setGorData] = useState<GorEvolutionRecord[]>([]);
  const [gorLoading, setGorLoading] = useState(false);

  useEffect(() => {
    fetchJson<string[]>(buildApiUrl("/catalog/pads"))
      .then(setPads)
      .catch(() => setPads([]))
      .finally(() => setPadsLoading(false));
  }, []);

  useEffect(() => {
    setExtrapolaciones([]);
    setSelectedEventTs(null);
    if (selectedPad && selectedPozo) setExtrapLoading(true);
    else setExtrapLoading(false);
  }, [selectedPad, selectedPozo]);

  useEffect(() => {
    if (!selectedPad || !selectedPozo) return;
    fetchJson<ExtrapolationEvent[]>(
      buildApiUrl("/pressure-extrapolation/extrapolacion_eventos/produccion", {
        pad: selectedPad,
        pozo: selectedPozo,
      }),
    )
      .then(setExtrapolaciones)
      .catch(() => setExtrapolaciones([]))
      .finally(() => setExtrapLoading(false));
  }, [selectedPad, selectedPozo, extrapRefreshKey]);

  useEffect(() => {
    setPreAperturaEvents([]);
    setSelectedPreAperturaTs(null);
    if (selectedPad && selectedPozo) setPreAperturaLoading(true);
    else setPreAperturaLoading(false);
  }, [selectedPad, selectedPozo]);

  useEffect(() => {
    if (!selectedPad || !selectedPozo) return;
    fetchJson<PreAperturaEvent[]>(
      buildApiUrl("/pressure-extrapolation/extrapolacion_eventos/pre_apertura", {
        pad: selectedPad,
        pozo: selectedPozo,
      }),
    )
      .then(setPreAperturaEvents)
      .catch(() => setPreAperturaEvents([]))
      .finally(() => setPreAperturaLoading(false));
  }, [selectedPad, selectedPozo, preAperturaRefreshKey]);

  useEffect(() => {
    setGorData([]);
    if (!selectedPad) return;
    setGorLoading(true);
    fetchJson<GorEvolutionRecord[]>(buildApiUrl("/well-analysis/gor-evolution", { pad: selectedPad }))
      .then(setGorData)
      .catch(() => setGorData([]))
      .finally(() => setGorLoading(false));
  }, [selectedPad]);

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

  const selectedPreAperturaEvent = useMemo(
    () => preAperturaEvents.find((e) => e.timestamp_evento === selectedPreAperturaTs) ?? null,
    [preAperturaEvents, selectedPreAperturaTs],
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
                <span>Extrapolación post-apertura</span>
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
                        <EventFitChart
                          event={selectedEvent}
                          onSaved={() => setExtrapRefreshKey((k) => k + 1)}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="pba-section-divider">
                <span>Extrapolación pre-apertura</span>
              </div>

              <div className="pba-chart-section">
                {preAperturaLoading ? (
                  <div className="loading-card">Cargando extrapolaciones pre-apertura…</div>
                ) : (
                  <>
                    <PreAperturaTable
                      events={preAperturaEvents}
                      selectedTs={selectedPreAperturaTs}
                      onSelect={(ts) => setSelectedPreAperturaTs((prev) => (prev === ts ? null : ts))}
                    />
                    {selectedPreAperturaEvent ? (
                      <div className="pba-chart-section pba-chart-section--inner">
                        <PreAperturaFitChart
                          event={selectedPreAperturaEvent}
                          onSaved={() => setPreAperturaRefreshKey((k) => k + 1)}
                        />
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
            <>
              <OverlayChart data={displayData} />

              <div className="pba-section-divider">
                <span>Producción del PAD</span>
              </div>

              <div className="pba-chart-section pba-chart-section--full">
                {gorLoading ? (
                  <div className="loading-card">Cargando datos de producción…</div>
                ) : (
                  <GorEvolutionPanel records={gorData} />
                )}
              </div>
            </>
          )}
        </div>
      ) : null}

      {!loading && !hasData && !error ? (
        <div className="loading-card">Seleccioná un PAD para cargar los datos.</div>
      ) : null}
    </section>
  );
}
