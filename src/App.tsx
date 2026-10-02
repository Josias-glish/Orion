import { getVersion } from "@tauri-apps/api/app";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Aviso } from "./componentes/Aviso";
import { BarraLateral } from "./componentes/BarraLateral";
import { ConexionContexto, NavegacionContexto, SesionContexto, type Ruta, type Sesion } from "./componentes/contextos";
import { consultarArranque, type EstadoArranque } from "./datos/arranque";
import type { Conexion } from "./datos/conexion";
import { abrirConexionTauri } from "./datos/conexion-tauri";
import { obtenerFinca, type Finca } from "./datos/repositorios/finca";
import type { Usuario } from "./datos/repositorios/usuarios";
import { puede, type Accion } from "./dominio/permisos";
import { Ajustes } from "./pantallas/ajustes/Ajustes";
import { FichaAnimal } from "./pantallas/animales/FichaAnimal";
import { FormularioAnimal } from "./pantallas/animales/FormularioAnimal";
import { Animales } from "./pantallas/animales/Animales";
import { Asistente } from "./pantallas/Asistente";
import { ElegirUsuario } from "./pantallas/ElegirUsuario";
import { Inicio } from "./pantallas/Inicio";
import { DetalleLactancia } from "./pantallas/leche/DetalleLactancia";
import { Leche } from "./pantallas/leche/Leche";
import { Documentos } from "./pantallas/documentos/Documentos";
import { Pesos } from "./pantallas/pesos/Pesos";
import { Salud } from "./pantallas/salud/Salud";
import { RegistrarParto } from "./pantallas/reproduccion/RegistrarParto";
import { Reproduccion } from "./pantallas/reproduccion/Reproduccion";
import { textos } from "./textos/es";

/** Permiso que exige cada pantalla (R14). */
const PERMISO_DE: Partial<Record<Ruta["pantalla"], Accion>> = {
  nuevoAnimal: "crear_animal",
  editarAnimal: "editar_animal",
  registrarParto: "registrar_parto",
  ajustes: "ver_ajustes",
};

function PantallaActual({ ruta }: { ruta: Ruta }) {
  switch (ruta.pantalla) {
    case "inicio":
      return <Inicio />;
    case "animales":
      return <Animales vista={ruta.vista ?? "hato"} />;
    case "animal":
      return <FichaAnimal key={ruta.id} id={ruta.id} pestana={ruta.pestana} />;
    case "nuevoAnimal":
      return <FormularioAnimal key={ruta.externo ? "nuevo-externo" : "nuevo"} externo={ruta.externo ?? false} />;
    case "editarAnimal":
      return <FormularioAnimal key={ruta.id} id={ruta.id} />;
    case "reproduccion":
      return <Reproduccion seccion={ruta.seccion} />;
    case "registrarParto":
      return <RegistrarParto key={ruta.hembraId ?? "nuevo"} hembraId={ruta.hembraId} />;
    case "leche":
      return <Leche seccion={ruta.seccion} />;
    case "lactancia":
      return <DetalleLactancia key={ruta.id} id={ruta.id} />;
    case "pesos":
      return <Pesos key={ruta.animalId ?? ""} seccion={ruta.seccion} animalId={ruta.animalId ?? null} />;
    case "salud":
      return <Salud key={ruta.animalId ?? ""} seccion={ruta.seccion} animalId={ruta.animalId ?? null} />;
    case "documentos":
      return <Documentos key={ruta.animalId ?? ""} seccion={ruta.seccion} animalId={ruta.animalId ?? null} />;
    case "ajustes":
      return <Ajustes seccion={ruta.seccion} />;
  }
}

export default function App() {
  const [conexion, setConexion] = useState<Conexion | null>(null);
  const [errorAlAbrir, setErrorAlAbrir] = useState<string | null>(null);
  const [arranque, setArranque] = useState<EstadoArranque | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [finca, setFinca] = useState<Finca | null>(null);
  const [ruta, setRuta] = useState<Ruta>({ pantalla: "inicio" });
  const [version, setVersion] = useState<string | null>(null);
  const [avisoArranque, setAvisoArranque] = useState<string | null>(null);

  const cargarArranque = useCallback(async (c: Conexion) => {
    const estado = await consultarArranque(c);
    setArranque(estado);
    setFinca(estado.finca);
    return estado;
  }, []);

  useEffect(() => {
    abrirConexionTauri()
      .then(async (c) => {
        setConexion(c);
        await cargarArranque(c);
      })
      .catch((error: unknown) => setErrorAlAbrir(String(error)));
    getVersion().then(setVersion, () => setVersion(null));
  }, [cargarArranque]);

  const navegar = useCallback((nueva: Ruta) => {
    setRuta(nueva);
    document.querySelector(".contenido")?.scrollTo(0, 0);
  }, []);

  const sesion = useMemo<Sesion | null>(() => {
    if (!conexion || !usuario || !finca) return null;
    return {
      usuario,
      finca,
      recargarFinca: async () => setFinca(await obtenerFinca(conexion)),
      cerrarSesion: () => {
        setUsuario(null);
        setRuta({ pantalla: "inicio" });
        cargarArranque(conexion);
      },
    };
  }, [conexion, usuario, finca, cargarArranque]);

  if (errorAlAbrir) {
    return (
      <main className="centrado">
        <Aviso tipo="error">
          <p>{textos.errores.abrirBase}</p>
          <details>
            <summary>{textos.errores.detalleTecnico}</summary>
            <code>{errorAlAbrir}</code>
          </details>
        </Aviso>
      </main>
    );
  }
  if (!conexion || !arranque) return <p className="centrado">{textos.comun.cargando}</p>;

  if (arranque.necesitaAsistente) {
    return (
      <ConexionContexto.Provider value={conexion}>
        <Asistente
          fincaExistente={arranque.finca}
          alTerminar={async (creado) => {
            await cargarArranque(conexion);
            setUsuario(creado);
          }}
          alRestaurar={async (mensaje) => {
            setAvisoArranque(mensaje);
            await cargarArranque(conexion);
          }}
        />
      </ConexionContexto.Provider>
    );
  }

  if (!sesion) {
    return (
      <ConexionContexto.Provider value={conexion}>
        {avisoArranque && (
          <div className="centrado-aviso" data-prueba="aviso-restaurado">
            <Aviso tipo="exito">{avisoArranque}</Aviso>
          </div>
        )}
        <ElegirUsuario usuarios={arranque.usuarios} alEntrar={setUsuario} />
      </ConexionContexto.Provider>
    );
  }

  const permiso = PERMISO_DE[ruta.pantalla];
  return (
    <ConexionContexto.Provider value={conexion}>
      <SesionContexto.Provider value={sesion}>
        <NavegacionContexto.Provider value={navegar}>
          <div className="marco">
            <BarraLateral
              ruta={ruta}
              usuario={sesion.usuario}
              version={version}
              alNavegar={navegar}
              alCambiarUsuario={sesion.cerrarSesion}
            />
            <main className="contenido">
              {permiso && !puede(sesion.usuario.rol, permiso) ? (
                <Aviso tipo="error">{textos.errores.motivo({ codigo: "sin_permiso" })}</Aviso>
              ) : (
                <PantallaActual ruta={ruta} />
              )}
            </main>
          </div>
        </NavegacionContexto.Provider>
      </SesionContexto.Provider>
    </ConexionContexto.Provider>
  );
}
