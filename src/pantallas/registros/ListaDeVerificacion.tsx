import { useNavegar, type Ruta } from "../../componentes/contextos";
import type { ListaDeVerificacion as Lista, Requisito } from "../../dominio/registros";
import { textos } from "../../textos/es";

const t = textos.registros.pantalla;

/** Dónde se corrige cada requisito que falta (el enlace «Corregir»). */
export function destinoDeRequisito(requisito: Requisito, animalId: string): Ruta {
  switch (requisito) {
    case "prefijo":
    case "criador":
    case "propietario":
      return { pantalla: "registros", seccion: "configuracion" };
    case "criadero":
      return { pantalla: "ajustes", seccion: "finca" };
    default:
      return { pantalla: "editarAnimal", id: animalId };
  }
}

/** R31: la lista de verificación de un animal. Lo que falta se marca con palabras (no solo con color) y trae su enlace. */
export function ListaDeVerificacion({ lista, animalId }: { lista: Lista; animalId: string }) {
  const navegar = useNavegar();
  return (
    <ul className="verificacion" data-prueba="lista-verificacion">
      {lista.items.map((i) => (
        <li key={i.requisito} className={`verificacion__item ${i.cumple ? "verificacion__item--cumple" : "verificacion__item--falta"}`} data-requisito={i.requisito} data-cumple={i.cumple}>
          <span className="verificacion__marca" aria-hidden="true">
            {i.cumple ? "✓" : "✗"}
          </span>
          <span>
            {textos.registros.requisitos[i.requisito]}
            <span className="nota"> — {i.cumple ? (i.exento ? t.exento : t.cumple) : t.falta}</span>
          </span>
          {!i.cumple && (
            <button type="button" className="enlace" onClick={() => navegar(destinoDeRequisito(i.requisito, animalId))} data-prueba={`corregir-${i.requisito}`}>
              {t.corregir}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Resumen corto de lo que falta, para una fila de tabla: «Falta: libro, madre» con un enlace por cada requisito. */
export function FaltantesEnLinea({ faltantes, animalId }: { faltantes: readonly Requisito[]; animalId: string }) {
  const navegar = useNavegar();
  if (faltantes.length === 0) return <span className="insignia insignia--activo">{t.cumpleTodo}</span>;
  return (
    <span data-prueba="faltantes-en-linea">
      <span className="destacado">{t.falta}: </span>
      {faltantes.map((f, i) => (
        <span key={f}>
          {i > 0 && ", "}
          <button type="button" className="enlace" onClick={() => navegar(destinoDeRequisito(f, animalId))} data-prueba={`corregir-${f}`}>
            {textos.registros.requisitos[f].toLowerCase()}
          </button>
        </span>
      ))}
    </span>
  );
}
