import { textos } from "../textos/es";

export type Pantalla = "inicio" | "animales" | "ajustes" | "diagnostico";

const OPCIONES: { pantalla: Pantalla; texto: string; temporal?: boolean }[] = [
  { pantalla: "inicio", texto: textos.menu.inicio },
  { pantalla: "animales", texto: textos.menu.animales },
  { pantalla: "ajustes", texto: textos.menu.ajustes },
  { pantalla: "diagnostico", texto: textos.menu.diagnostico, temporal: true },
];

interface Props {
  actual: Pantalla;
  version: string | null;
  alElegir: (pantalla: Pantalla) => void;
}

export function BarraLateral({ actual, version, alElegir }: Props) {
  return (
    <nav className="barra-lateral" aria-label={textos.menu.titulo}>
      <div className="barra-lateral__marca">{textos.app.nombre}</div>
      <ul className="barra-lateral__lista">
        {OPCIONES.map((opcion) => (
          <li key={opcion.pantalla}>
            <button
              type="button"
              className="barra-lateral__opcion"
              aria-current={actual === opcion.pantalla ? "page" : undefined}
              onClick={() => alElegir(opcion.pantalla)}
              data-pantalla={opcion.pantalla}
            >
              {opcion.texto}
              {opcion.temporal && <span className="etiqueta">{textos.menu.temporal}</span>}
            </button>
          </li>
        ))}
      </ul>
      {version && <div className="barra-lateral__version">{textos.app.version(version)}</div>}
    </nav>
  );
}
