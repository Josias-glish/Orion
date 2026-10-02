import { useState } from "react";
import type { Direccion } from "../dominio/orden";

/** Qué columna ordena una tabla y en qué sentido; al elegir la misma columna otra vez, se invierte. */
export function useOrden<T extends string>(claveInicial: T, direccionInicial: Direccion = "asc") {
  const [orden, setOrden] = useState<{ clave: T; direccion: Direccion }>({ clave: claveInicial, direccion: direccionInicial });
  const elegir = (clave: T) =>
    setOrden((o) => (o.clave === clave ? { clave, direccion: o.direccion === "asc" ? "desc" : "asc" } : { clave, direccion: "asc" }));
  return { ...orden, elegir };
}

interface Props<T extends string> {
  clave: T;
  texto: string;
  /** Texto de ayuda del botón (por ejemplo «Ordenar por grasa»). */
  ayuda: string;
  actual: T;
  direccion: Direccion;
  alElegir: (clave: T) => void;
  numerico?: boolean;
}

/** Título de columna que ordena la tabla al hacer clic. El sentido se dice con una flecha y con `aria-sort`, no solo con color. */
export function TituloOrdenable<T extends string>({ clave, texto, ayuda, actual, direccion, alElegir, numerico = false }: Props<T>) {
  const activo = actual === clave;
  return (
    <th className={numerico ? "numero" : undefined} aria-sort={activo ? (direccion === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="orden" title={ayuda} onClick={() => alElegir(clave)} data-orden={clave}>
        {texto}
        <span aria-hidden="true">{activo ? (direccion === "asc" ? " ▲" : " ▼") : ""}</span>
      </button>
    </th>
  );
}
