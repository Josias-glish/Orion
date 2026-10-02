import { Aviso } from "../../componentes/Aviso";
import { useNavegar, usePermiso, type SeccionRegistros } from "../../componentes/contextos";
import { Pestanas } from "../../componentes/Pestanas";
import { textos } from "../../textos/es";
import { ConfiguracionRegistros } from "./ConfiguracionRegistros";
import { LibroGenealogico } from "./LibroGenealogico";
import { ListaRegistros } from "./ListaRegistros";
import { Verificacion } from "./Verificacion";

const t = textos.registros.pantalla;
const SECCIONES: SeccionRegistros[] = ["registros", "verificacion", "libro", "configuracion"];

/** RF-49 (R31): el libro genealógico propio del criadero. Solo el propietario (R23). */
export function Registros({ seccion, registroId }: { seccion: SeccionRegistros; registroId: string | null }) {
  const navegar = useNavegar();
  const puede = usePermiso("ver_registros");
  if (!puede) return <Aviso tipo="error">{t.soloPropietario}</Aviso>;
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas opciones={SECCIONES.map((valor) => ({ valor, texto: t.secciones[valor] }))} actual={seccion} alElegir={(s) => navegar({ pantalla: "registros", seccion: s })} />
      {seccion === "registros" && <ListaRegistros abiertoInicial={registroId} />}
      {seccion === "verificacion" && <Verificacion />}
      {seccion === "libro" && <LibroGenealogico />}
      {seccion === "configuracion" && <ConfiguracionRegistros />}
    </section>
  );
}
