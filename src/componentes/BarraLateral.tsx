import type { Usuario } from "../datos/repositorios/usuarios";
import { puede } from "../dominio/permisos";
import { textos } from "../textos/es";
import type { Ruta } from "./contextos";

type Seccion = "inicio" | "animales" | "reproduccion" | "leche" | "pesos" | "salud" | "documentos" | "registros" | "finanzas" | "traspasos" | "ajustes";

const SECCION_DE: Record<Ruta["pantalla"], Seccion> = {
  inicio: "inicio",
  animales: "animales",
  animal: "animales",
  nuevoAnimal: "animales",
  editarAnimal: "animales",
  reproduccion: "reproduccion",
  registrarParto: "reproduccion",
  leche: "leche",
  lactancia: "leche",
  pesos: "pesos",
  salud: "salud",
  documentos: "documentos",
  registros: "registros",
  finanzas: "finanzas",
  traspasos: "traspasos",
  registrarCompra: "animales",
  registrarVenta: "animales",
  ajustes: "ajustes",
};

const DESTINO: Record<Seccion, Ruta> = {
  inicio: { pantalla: "inicio" },
  animales: { pantalla: "animales" },
  reproduccion: { pantalla: "reproduccion", seccion: "servicios" },
  leche: { pantalla: "leche", seccion: "ordeno" },
  pesos: { pantalla: "pesos", seccion: "registrar" },
  salud: { pantalla: "salud", seccion: "registrar" },
  documentos: { pantalla: "documentos", seccion: "certificado" },
  registros: { pantalla: "registros", seccion: "registros" },
  finanzas: { pantalla: "finanzas", seccion: "movimientos" },
  traspasos: { pantalla: "traspasos" },
  ajustes: { pantalla: "ajustes", seccion: "finca" },
};

interface Props {
  ruta: Ruta;
  usuario: Usuario;
  version: string | null;
  alNavegar: (ruta: Ruta) => void;
  alCambiarUsuario: () => void;
}

export function BarraLateral({ ruta, usuario, version, alNavegar, alCambiarUsuario }: Props) {
  const secciones: Seccion[] = ["inicio", "animales", "reproduccion", "leche", "pesos", "salud", "documentos"];
  // R23 y R31: el operario no ve Registros.
  if (puede(usuario.rol, "ver_registros")) secciones.push("registros");
  // R23: el operario tampoco ve Finanzas.
  if (puede(usuario.rol, "ver_finanzas")) secciones.push("finanzas");
  // R23: el operario tampoco ve las compras y ventas de animales.
  if (puede(usuario.rol, "ver_traspasos")) secciones.push("traspasos");
  // R14: el operario no ve Ajustes.
  if (puede(usuario.rol, "ver_ajustes")) secciones.push("ajustes");
  const actual = SECCION_DE[ruta.pantalla];

  return (
    <nav className="barra-lateral" aria-label={textos.menu.titulo}>
      <div className="barra-lateral__marca">{textos.app.nombre}</div>
      <ul className="barra-lateral__lista">
        {secciones.map((s) => (
          <li key={s}>
            <button
              type="button"
              className="barra-lateral__opcion"
              aria-current={actual === s ? "page" : undefined}
              onClick={() => alNavegar(DESTINO[s])}
              data-pantalla={s}
            >
              {textos.menu[s]}
            </button>
          </li>
        ))}
      </ul>
      <div className="barra-lateral__pie">
        <div className="barra-lateral__usuario" data-prueba="usuario-actual">
          {textos.sesion.usuarioActual(usuario.nombre, usuario.rol)}
        </div>
        <button type="button" className="barra-lateral__cambiar" onClick={alCambiarUsuario} data-prueba="cambiar-usuario">
          {textos.menu.cambiarUsuario}
        </button>
        {version && <div className="barra-lateral__version">{textos.app.version(version)}</div>}
      </div>
    </nav>
  );
}
