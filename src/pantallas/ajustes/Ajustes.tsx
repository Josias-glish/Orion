import { useNavegar, type SeccionAjustes } from "../../componentes/contextos";
import { Pestanas } from "../../componentes/Pestanas";
import { textos } from "../../textos/es";
import { SeccionCatalogo } from "./SeccionCatalogo";
import { SeccionDatos } from "./SeccionDatos";
import { SeccionFinca } from "./SeccionFinca";
import { SeccionLotes } from "./SeccionLotes";
import { SeccionUsuarios } from "./SeccionUsuarios";
import { SeccionSincronizacion } from "../sincronizacion/SeccionSincronizacion";

const SECCIONES: SeccionAjustes[] = ["finca", "usuarios", "razas", "libros", "lotes", "sincronizacion", "datos"];

/** Ajustes (solo propietario, R14): finca, usuarios, catálogos, lotes y datos técnicos. */
export function Ajustes({ seccion }: { seccion: SeccionAjustes }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{textos.ajustes.titulo}</h1>
      <Pestanas
        opciones={SECCIONES.map((s) => ({ valor: s, texto: textos.ajustes.secciones[s] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "ajustes", seccion: s })}
      />
      {seccion === "finca" && <SeccionFinca />}
      {seccion === "usuarios" && <SeccionUsuarios />}
      {seccion === "razas" && <SeccionCatalogo catalogo="raza" />}
      {seccion === "libros" && <SeccionCatalogo catalogo="libro" />}
      {seccion === "lotes" && <SeccionLotes />}
      {seccion === "sincronizacion" && <SeccionSincronizacion />}
      {seccion === "datos" && <SeccionDatos />}
    </section>
  );
}
