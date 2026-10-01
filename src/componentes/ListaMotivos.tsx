import { useEffect, useRef } from "react";
import { textos } from "../textos/es";
import { mensajesDeError } from "./mensajeDeError";

/** Muestra por qué no se pudo guardar, con todos los motivos juntos. Recibe el foco para que se lea primero. */
export function ListaMotivos({ error }: { error: unknown }) {
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) caja.current?.focus();
  }, [error]);
  if (!error) return null;
  const { mensajes, detalle } = mensajesDeError(error);
  return (
    <div className="aviso aviso--error" role="alert" tabIndex={-1} ref={caja} data-prueba="errores">
      <p className="destacado">{textos.errores.titulo}</p>
      <ul>
        {mensajes.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
      {detalle && (
        <details>
          <summary>{textos.errores.detalleTecnico}</summary>
          <code>{detalle}</code>
        </details>
      )}
    </div>
  );
}
