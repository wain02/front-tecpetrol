import type { ExtrapolationEvent } from "./types";
import { cx, formatEventDate } from "./utils";

export function ExtrapolationTable({
  events,
  selectedTs,
  onSelect,
}: {
  events: ExtrapolationEvent[];
  selectedTs: string | null;
  onSelect: (ts: string) => void;
}) {
  const aperturas = events
    .filter((e) => e.tipo_evento === "apertura")
    .sort((a, b) => a.timestamp_evento.localeCompare(b.timestamp_evento));

  if (aperturas.length === 0) {
    return <div className="loading-card">Sin eventos de apertura para este pozo.</div>;
  }

  const fmt = (v: number | null, digits: number) => (v == null ? "—" : v.toFixed(digits));

  const rows: Array<{ label: string; get: (e: ExtrapolationEvent) => string }> = [
    { label: "Puntos tomados", get: (e) => String(e.N_puntos) },
    { label: "P(t=0) Exponencial (psi)", get: (e) => fmt(e.P_estimada_exp, 1) },
    { label: "R² Exponencial", get: (e) => fmt(e.R2_exp, 3) },
    { label: "P(t=0) Semilog (psi)", get: (e) => fmt(e.P_estimada_semilog, 1) },
    { label: "R² Semilog", get: (e) => fmt(e.R2_semilog, 3) },
  ];

  return (
    <div className="extrap-table-wrap">
      <table className="extrap-table">
        <thead>
          <tr>
            <th className="extrap-table__stub">Métrica</th>
            {aperturas.map((e) => {
              const active = e.timestamp_evento === selectedTs;
              return (
                <th
                  key={e.timestamp_evento}
                  className={cx("extrap-table__event", active && "extrap-table__event--active")}
                >
                  <button
                    type="button"
                    className="extrap-table__button"
                    onClick={() => onSelect(e.timestamp_evento)}
                  >
                    <strong>{formatEventDate(e.timestamp_evento)}</strong>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ label, get }) => (
            <tr key={label}>
              <th scope="row" className="extrap-table__stub">
                {label}
              </th>
              {aperturas.map((e) => {
                const active = e.timestamp_evento === selectedTs;
                return (
                  <td key={`${e.timestamp_evento}-${label}`} className={cx(active && "extrap-table__cell--active")}>
                    {get(e)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
