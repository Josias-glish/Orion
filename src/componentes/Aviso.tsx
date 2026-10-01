import type { ReactNode } from "react";

interface Props {
  tipo: "exito" | "error" | "info";
  children: ReactNode;
}

/** Mensaje destacado. Los errores se anuncian a los lectores de pantalla de inmediato. */
export function Aviso({ tipo, children }: Props) {
  return (
    <div className={`aviso aviso--${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
