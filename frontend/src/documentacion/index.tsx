export function Documentacion() {
  return (
    <section className="docs">
      <div className="docs__card">
        <h1>Documentacion del formato</h1>
        <p>Estas reglas explican como debe venir el Excel para que el pipeline lo procese correctamente.</p>

        <div className="docs__grid">
          <div className="docs__block">
            <h2>Reglas del Excel</h2>
            <ul className="docs__list">
              <li>El archivo debe tener una fila de encabezados.</li>
              <li>La columna de fecha/hora debe llamarse exactamente: FECHA Y HORA.</li>
              <li>Cada fila debe representar una medicion temporal.</li>
              <li>No usar celdas combinadas ni multiples filas de encabezado.</li>
              <li>No dejar filas vacias entre registros.</li>
              <li>Los nombres de columnas deben contener las palabras clave esperadas.</li>
              <li>Las columnas criticas no pueden faltar.</li>
            </ul>
          </div>

          <div className="docs__block">
            <h2>Columnas obligatorias</h2>
            <p>
              <strong>Por cada pozo</strong>
            </p>
            <ul className="docs__list">
              <li>Presion Boca + Pozo1 / Pozo2 / Pozo3</li>
              <li>Presion Anular + Pozo1 / Pozo2 / Pozo3</li>
            </ul>
            <p>
              <strong>Del PAD</strong>
            </p>
            <ul className="docs__list">
              <li>Presion Separador (psi)</li>
              <li>Caudal Liquidos totales (l/hora)</li>
              <li>Caudal GAS (m3/hora)</li>
            </ul>
          </div>
        </div>

        <div className="docs__block">
          <h2>Ejemplos validos</h2>
          <ul className="docs__list">
            <li>Presion Boca de pozo (psi) Pozo1</li>
            <li>Presion Anular (psi) Pozo1</li>
            <li>Presion Separador (psi)</li>
            <li>Caudal Liquidos totales (l/hora)</li>
            <li>Caudal GAS (m3/hora)</li>
          </ul>
        </div>

        <div className="docs__block">
          <h2>Columnas opcionales</h2>
          <p>El sistema tambien puede leer, si existen:</p>
          <ul className="docs__list">
            <li>Orificio</li>
            <li>Temperatura</li>
            <li>Densidad AGUA</li>
            <li>CLORO</li>
            <li>Solidos</li>
            <li>OIL</li>
            <li>AGUA</li>
            <li>GLR</li>
            <li>Comentarios</li>
          </ul>
          <p>Si alguna columna opcional no esta, se completa con valores vacios.</p>
        </div>
      </div>
    </section>
  );
}
