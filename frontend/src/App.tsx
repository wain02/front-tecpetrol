import { useState } from "react";
import tecpetrolLogo from "../logos/logo-tecpe.png";
import { PresionBocaAnalysis } from "./presion-boca";
import { CargaCsv } from "./carga-csv";
import { Documentacion } from "./documentacion";
import { AnalisisCurva } from "./analisis-curva";

type Tab = "upload" | "docs" | "presion-boca" | "analisis-curva";

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
              className={cx("tab", activeTab === "upload" && "tab--active")}
              onClick={() => setActiveTab("upload")}
            >
              Cargar CSV
            </button>
            <button
              type="button"
              className={cx("tab", activeTab === "docs" && "tab--active")}
              onClick={() => setActiveTab("docs")}
            >
              Documentacion
            </button>
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
          </nav>
        </header>

        {activeTab === "upload" ? (
          <CargaCsv />
        ) : activeTab === "docs" ? (
          <Documentacion />
        ) : activeTab === "analisis-curva" ? (
          <AnalisisCurva />
        ) : (
          <PresionBocaAnalysis />
        )}
      </div>
    </main>
  );
}

export default App;
