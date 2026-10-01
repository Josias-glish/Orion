import { useConexion, useNavegar } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { calcularConsanguinidad, consultarArbol, consultarHijos, type NodoArbol } from "../../datos/repositorios/genealogia";
import { formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";

/** Generaciones de ancestros que muestra el árbol (RF-09 pide tres como mínimo). */
const GENERACIONES_ARBOL = 3;
const FILAS = 2 ** GENERACIONES_ARBOL;

/** Caminos de una generación en orden: P antes que M («PP», «PM», «MP», «MM»…). */
function caminosDeGeneracion(g: number): string[] {
  if (g === 0) return [""];
  return caminosDeGeneracion(g - 1).flatMap((c) => [`${c}P`, `${c}M`]);
}

/** RF-09, RF-10 y RF-13: árbol de tres generaciones, consanguinidad y marca «sin verificar». */
export function Genealogia({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const { datos } = useCarga(
    async () => ({
      arbol: await consultarArbol(conexion, animalId, GENERACIONES_ARBOL),
      consanguinidad: await calcularConsanguinidad(conexion, animalId),
      hijos: await consultarHijos(conexion, animalId),
    }),
    [conexion, animalId],
  );
  const t = textos.genealogia;
  if (!datos) return <p>{textos.comun.cargando}</p>;

  const porCamino = new Map(datos.arbol.map((n) => [n.camino, n]));
  const { coeficiente, incluyeSinVerificar, generaciones } = datos.consanguinidad;
  const hijos = [...datos.hijos.comoPadre, ...datos.hijos.comoMadre];

  return (
    <div>
      <div className="tarjeta">
        <h2>{t.consanguinidadTitulo}</h2>
        <p className="cifra-grande" data-prueba="consanguinidad">
          {textos.comun.porcentaje(coeficiente * 100)}
        </p>
        {coeficiente === 0 && <p>{t.sinConsanguinidad}</p>}
        {incluyeSinVerificar && <p className="aviso aviso--info">{t.avisoSinVerificar}</p>}
        <p className="nota">{t.consanguinidadExplicacion(generaciones)}</p>
      </div>

      <h2>{t.arbolTitulo}</h2>
      <p className="nota">{t.ayudaArbol}</p>
      <div className="arbol" data-prueba="arbol">
        {t.columnas.map((titulo, g) => (
          <div key={titulo} className="arbol__titulo" style={{ gridColumn: g + 1 }}>
            {titulo}
          </div>
        ))}
        {Array.from({ length: GENERACIONES_ARBOL + 1 }, (_, g) =>
          caminosDeGeneracion(g).map((camino, i) => {
            const alto = FILAS / 2 ** g;
            return (
              <div
                key={camino || "animal"}
                className="arbol__celda"
                style={{ gridColumn: g + 1, gridRow: `${i * alto + 2} / span ${alto}` }}
              >
                <NodoGenealogico
                  camino={camino}
                  nodo={porCamino.get(camino) ?? null}
                  alElegir={(id) => navegar({ pantalla: "animal", id, pestana: "genealogia" })}
                />
              </div>
            );
          }),
        )}
      </div>

      <h2>{t.hijosTitulo}</h2>
      {hijos.length === 0 ? (
        <p className="nota">{t.sinHijos}</p>
      ) : (
        <ul className="lista-enlaces">
          {hijos.map((h) => (
            <li key={h.id}>
              <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: h.id, pestana: "genealogia" })}>
                {h.nombre ?? textos.animales.sinNombre}
              </button>
              {h.fechaNacimiento && <span className="nota"> · {formatearFecha(h.fechaNacimiento)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NodoGenealogico({
  camino,
  nodo,
  alElegir,
}: {
  camino: string;
  nodo: NodoArbol | null;
  alElegir: (id: string) => void;
}) {
  const t = textos.genealogia;
  const parentesco = camino ? textos.parentesco(camino) : null;
  if (!nodo) {
    return (
      <div className="nodo nodo--vacio" data-camino={camino}>
        {parentesco && <span className="nodo__parentesco">{parentesco}</span>}
        <span>{t.desconocido}</span>
      </div>
    );
  }
  const contenido = (
    <>
      {parentesco && <span className="nodo__parentesco">{parentesco}</span>}
      <span className="nodo__nombre">{nodo.nombre ?? nodo.identificador ?? textos.animales.sinNombre}</span>
      {nodo.identificador && nodo.nombre && <span className="nodo__dato">{nodo.identificador}</span>}
      {nodo.fechaNacimiento && <span className="nodo__dato">{formatearFecha(nodo.fechaNacimiento)}</span>}
      {nodo.sinVerificar && <span className="insignia insignia--aviso">{t.sinVerificar}</span>}
      {!nodo.enHato && <span className="insignia">{textos.animales.soloGenealogia}</span>}
    </>
  );
  if (!camino) {
    return (
      <div className="nodo nodo--principal" data-camino="">
        {contenido}
      </div>
    );
  }
  return (
    <button type="button" className={`nodo nodo--${nodo.sexo}`} onClick={() => alElegir(nodo.id)} data-camino={camino}>
      {contenido}
    </button>
  );
}
