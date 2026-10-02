import { useNavegar, usePermiso, type VistaAnimales } from "../../componentes/contextos";
import { Pestanas } from "../../componentes/Pestanas";
import { textos } from "../../textos/es";
import { Contactos } from "./Contactos";
import { ListaAnimales } from "./ListaAnimales";
import { ListaExternos } from "./ListaExternos";

/** Animales: los del hato (inventario), los de otras fincas (R29) y sus propietarios (contactos). */
export function Animales({ vista }: { vista: VistaAnimales }) {
  const navegar = useNavegar();
  // R23 y R28 (SUPOSICION): solo el propietario ve la lista de contactos con teléfonos y correos.
  const verContactos = usePermiso("ver_contactos");
  const t = textos.animales;
  const actual = vista === "contactos" && !verContactos ? "hato" : vista;
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={[
          { valor: "hato" as const, texto: t.vistas.hato },
          { valor: "externos" as const, texto: t.vistas.externos },
          ...(verContactos ? [{ valor: "contactos" as const, texto: t.vistas.contactos }] : []),
        ]}
        actual={actual}
        alElegir={(v) => navegar({ pantalla: "animales", vista: v })}
      />
      {actual === "hato" && <ListaAnimales />}
      {actual === "externos" && <ListaExternos />}
      {actual === "contactos" && <Contactos />}
    </section>
  );
}
