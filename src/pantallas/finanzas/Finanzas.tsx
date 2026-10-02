import { useNavegar, type SeccionFinanzas } from "../../componentes/contextos";
import { Pestanas } from "../../componentes/Pestanas";
import { textos } from "../../textos/es";
import { Categorias } from "./Categorias";
import { Movimientos } from "./Movimientos";
import { ResumenFinanciero } from "./ResumenFinanciero";

const t = textos.finanzas;

/** RF-33 y RF-34: ingresos y gastos, resumen y categorías. Solo el propietario (R23): la ruta exige `ver_finanzas`. */
export function Finanzas({ seccion }: { seccion: SeccionFinanzas }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha" data-prueba="pantalla-finanzas">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["movimientos", "resumen", "categorias"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "finanzas", seccion: s })}
      />
      {seccion === "movimientos" && <Movimientos />}
      {seccion === "resumen" && <ResumenFinanciero />}
      {seccion === "categorias" && <Categorias />}
    </section>
  );
}
