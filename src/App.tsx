import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";
import { Aviso } from "./componentes/Aviso";
import { BarraLateral, type Pantalla } from "./componentes/BarraLateral";
import { ConexionContexto } from "./componentes/ConexionContexto";
import type { Conexion } from "./datos/conexion";
import { abrirConexionTauri } from "./datos/conexion-tauri";
import { Ajustes } from "./pantallas/Ajustes";
import { Animales } from "./pantallas/Animales";
import { Diagnostico } from "./pantallas/Diagnostico";
import { Inicio } from "./pantallas/Inicio";
import { textos } from "./textos/es";

const PANTALLAS: Record<Pantalla, () => React.JSX.Element> = {
  inicio: Inicio,
  animales: Animales,
  ajustes: Ajustes,
  diagnostico: Diagnostico,
};

export default function App() {
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [errorAlAbrir, setErrorAlAbrir] = useState<string | null>(null);
  const [pantalla, setPantalla] = useState<Pantalla>("inicio");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    abrirConexionTauri()
      .then(setConexion)
      .catch((error: unknown) => setErrorAlAbrir(String(error)));
    getVersion().then(setVersion);
  }, []);

  const PantallaActual = PANTALLAS[pantalla];
  return (
    <div className="marco">
      <BarraLateral actual={pantalla} version={version} alElegir={setPantalla} />
      <main className="contenido">
        {errorAlAbrir ? (
          <Aviso tipo="error">
            <p>{textos.errores.abrirBase}</p>
            <details>
              <summary>{textos.errores.detalleTecnico}</summary>
              <code>{errorAlAbrir}</code>
            </details>
          </Aviso>
        ) : conexion ? (
          <ConexionContexto.Provider value={conexion}>
            <PantallaActual />
          </ConexionContexto.Provider>
        ) : (
          <p>{textos.comun.cargando}</p>
        )}
      </main>
    </div>
  );
}
