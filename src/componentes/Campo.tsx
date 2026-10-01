import type { ReactNode } from "react";

interface Props {
  etiqueta: string;
  ayuda?: string;
  children: ReactNode;
  ancho?: "corto" | "medio" | "largo";
}

/** Etiqueta, control y texto de ayuda. La etiqueta envuelve al control para que hacer clic en ella lo active. */
export function Campo({ etiqueta, ayuda, children, ancho = "medio" }: Props) {
  return (
    <label className={`campo campo--${ancho}`}>
      <span className="campo__etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="campo__ayuda">{ayuda}</span>}
    </label>
  );
}

/** Casilla de verificación con su texto al lado. */
export function Casilla({
  etiqueta,
  marcada,
  alCambiar,
  prueba,
}: {
  etiqueta: string;
  marcada: boolean;
  alCambiar: (valor: boolean) => void;
  prueba?: string;
}) {
  return (
    <label className="casilla">
      <input type="checkbox" checked={marcada} onChange={(e) => alCambiar(e.target.checked)} data-prueba={prueba} />
      <span>{etiqueta}</span>
    </label>
  );
}
