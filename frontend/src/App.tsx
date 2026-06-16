import { useState } from "react";
import tecpetrolLogo from "../logos/logo-tecpe.png";
import { AnalisisCurva } from "./analisis-curva";
import { CargaDatos } from "./carga-datos";
import { Informe } from "./informe";
import { PresionBocaAnalysis } from "./presion-boca";

type Tab = "presion-boca" | "analisis-curva" | "backend" | "informe";

function cx(...items: Array<string | false | undefined>): string {
  return items.filter(Boolean).join(" ");
}

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("presion-boca");

  return (
    <main className="page">
      <div className="orb orb--one" />
      <div className="orb orb--two" />
      <div className="orb orb--three" />

      <div className="shell">
        <header className="topbar">
          <img src={tecpetrolLogo} alt="Tecpetrol" className="topbar__logo" />
          <nav className="tabs" aria-label="Secciones">
            <button
              type="button"
              className={cx("tab", activeTab === "presion-boca" && "tab--active")}
              onClick={() => setActiveTab("presion-boca")}
            >
              Análisis presión
            </button>
            <button
              type="button"
              className={cx("tab", activeTab === "analisis-curva" && "tab--active")}
              onClick={() => setActiveTab("analisis-curva")}
            >
              Análisis curva
            </button>
            <button
              type="button"
              className={cx("tab", activeTab === "backend" && "tab--active")}
              onClick={() => setActiveTab("backend")}
            >
              Carga Archivos
            </button>
            <button
              type="button"
              className={cx("tab", activeTab === "informe" && "tab--active")}
              onClick={() => setActiveTab("informe")}
            >
              Informe
            </button>
          </nav>
        </header>

        {activeTab === "analisis-curva" ? (
          <AnalisisCurva />
        ) : activeTab === "backend" ? (
          <CargaDatos />
        ) : activeTab === "informe" ? (
          <Informe />
        ) : (
          <PresionBocaAnalysis />
        )}
      </div>
    </main>
  );
}

export default App;
