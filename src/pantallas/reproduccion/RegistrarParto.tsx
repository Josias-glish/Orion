import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { ErrorDeRegistro } from "../../datos/errores";
import { listarAnimales } from "../../datos/repositorios/animales";
import { padrePropuesto, registrarParto, type ResultadoParto } from "../../datos/repositorios/reproduccion";
import { esFechaValida, fechaLocal, formatearFecha } from "../../dominio/fechas";
import { leerKilos } from "../../dominio/leche";
import type { CriaAnotada } from "../../dominio/reproduccion";
import { textos } from "../../textos/es";

const t = textos.parto;
/** SUPOSICION: el formulario admite hasta 6 crías por parto (las cabras suelen tener de 1 a 3). */
const MAXIMO_CRIAS = 6;

interface CriaEnFormulario extends Omit<CriaAnotada, "pesoNacimiento" | "nombre" | "arete"> {
  nombre: string;
  arete: string;
  peso: string;
}

const criaVacia = (): CriaEnFormulario => ({ sexo: "hembra", nombre: "", arete: "", peso: "", nacioMuerta: false });

/** Flujo 1 (RF-20, R5): parto con una ficha por cría y apertura de la lactancia. */
export function RegistrarParto({ hembraId: inicial }: { hembraId: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const [hembraId, setHembraId] = useState<string | null>(inicial);
  const [fecha, setFecha] = useState(fechaLocal());
  const [crias, setCrias] = useState<CriaEnFormulario[]>([criaVacia()]);
  const [observaciones, setObservaciones] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoParto | null>(null);
  const puedeEmitir = usePermiso("emitir_documento");
  const { datos: hembras } = useCarga(() => listarAnimales(conexion, { sexo: "hembra", estado: "activo" }), [conexion]);
  const { datos: padre } = useCarga(
    async () => (hembraId && esFechaValida(fecha) ? padrePropuesto(conexion, hembraId, fecha) : null),
    [conexion, hembraId, fecha],
  );
  const madre = hembras?.find((h) => h.id === hembraId);

  const cambiarNumero = (n: number) => {
    const cantidad = Math.min(MAXIMO_CRIAS, Math.max(1, Math.trunc(n) || 1));
    setCrias((actuales) => Array.from({ length: cantidad }, (_, i) => actuales[i] ?? criaVacia()));
  };
  const cambiarCria = (i: number, cambio: Partial<CriaEnFormulario>) =>
    setCrias((actuales) => actuales.map((c, j) => (j === i ? { ...c, ...cambio } : c)));

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const anotadas: CriaAnotada[] = crias.map((c) => ({
        sexo: c.sexo,
        nombre: c.nombre.trim() || null,
        arete: c.arete.trim() || null,
        // Un peso mal escrito se envía como -1 para que el repositorio lo rechace con su mensaje.
        pesoNacimiento: c.peso.trim() ? (leerKilos(c.peso) ?? -1) : null,
        nacioMuerta: c.nacioMuerta,
      }));
      if (!hembraId) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "madre_id" }]);
      setResultado(await registrarParto(conexion, { hembraId, fecha, crias: anotadas, observaciones: observaciones || null }, contexto()));
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  }

  if (resultado) {
    return (
      <section className="pantalla">
        <h1>{t.titulo}</h1>
        <Aviso tipo="exito">
          <p>{t.guardado(resultado.criasIds.length)}</p>
        </Aviso>
        <ul className="lista-enlaces" data-prueba="crias-creadas">
          {resultado.criasIds.map((id, i) => (
            <li key={id}>
              <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id, pestana: "ficha" })}>
                {crias[i].nombre.trim() || crias[i].arete.trim() || t.cria(i + 1)} — {t.verCria}
              </button>
              {/* Flujo 1: opcionalmente se emite el certificado interno de la cría. */}
              {puedeEmitir && !crias[i].nacioMuerta && (
                <>
                  {" · "}
                  <button type="button" className="enlace" onClick={() => navegar({ pantalla: "documentos", seccion: "certificado", animalId: id })}>
                    {t.emitirCertificado}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="acciones">
          {hembraId && (
            <button
              type="button"
              className="boton boton--secundario"
              onClick={() => navegar({ pantalla: "animal", id: hembraId, pestana: "reproduccion" })}
            >
              {madre?.nombre ?? t.hembra}
            </button>
          )}
          <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "leche", seccion: "lactancias" })}>
            {textos.leche.secciones.lactancias}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="pantalla pantalla--ancha">
      <h1>{madre?.nombre ? `${t.titulo}: ${madre.nombre}` : t.titulo}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        data-prueba="formulario-parto"
      >
        <ListaMotivos error={error} />
        <div className="tarjeta">
          <div className="rejilla">
            <SelectorAnimal etiqueta={t.hembra} candidatos={hembras ?? []} valor={hembraId} alCambiar={setHembraId} prueba="parto-hembra" />
            <Campo etiqueta={t.fecha} ancho="corto">
              <input type="date" value={fecha} max={fechaLocal()} onChange={(e) => setFecha(e.target.value)} data-prueba="parto-fecha" />
            </Campo>
            <Campo etiqueta={t.numeroCrias} ancho="corto">
              <input
                type="number"
                min={1}
                max={MAXIMO_CRIAS}
                value={crias.length}
                onChange={(e) => cambiarNumero(Number(e.target.value))}
                data-prueba="parto-numero"
              />
            </Campo>
            <Campo etiqueta={t.observaciones} ancho="largo">
              <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </Campo>
          </div>
          {padre && (
            <>
              <h2>{t.padreTitulo}</h2>
              <p data-prueba="padre-propuesto">
                {padre.padreId && padre.nombrePadre
                  ? t.padreDelServicio(padre.nombrePadre, formatearFecha(padre.fechaServicio ?? fecha))
                  : padre.pajilla
                    ? t.padrePajilla(padre.pajilla, formatearFecha(padre.fechaServicio ?? fecha))
                    : t.sinServicio}
              </p>
            </>
          )}
        </div>

        <h2>{t.criasTitulo}</h2>
        <p className="nota">{t.criasAyuda}</p>
        {crias.map((c, i) => (
          <fieldset key={i} className="tarjeta cria" data-cria={i + 1}>
            <legend className="destacado">{t.cria(i + 1)}</legend>
            <div className="rejilla">
              <Campo etiqueta={t.sexo} ancho="corto">
                <select value={c.sexo} onChange={(e) => cambiarCria(i, { sexo: e.target.value as CriaAnotada["sexo"] })} data-prueba="cria-sexo">
                  {(["hembra", "macho"] as const).map((s) => (
                    <option key={s} value={s}>
                      {textos.comun.sexo[s]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta={t.nombre}>
                <input value={c.nombre} onChange={(e) => cambiarCria(i, { nombre: e.target.value })} data-prueba="cria-nombre" />
              </Campo>
              <Campo etiqueta={t.arete} ancho="corto">
                <input value={c.arete} onChange={(e) => cambiarCria(i, { arete: e.target.value })} data-prueba="cria-arete" />
              </Campo>
              <Campo etiqueta={t.peso} ancho="corto">
                <input inputMode="decimal" value={c.peso} onChange={(e) => cambiarCria(i, { peso: e.target.value })} data-prueba="cria-peso" />
              </Campo>
              <Casilla etiqueta={t.nacioMuerta} marcada={c.nacioMuerta} alCambiar={(v) => cambiarCria(i, { nacioMuerta: v })} />
            </div>
          </fieldset>
        ))}

        <p className="nota">{t.lactanciaAviso}</p>
        <div className="acciones">
          <button type="submit" className="boton" disabled={guardando} data-prueba="guardar-parto">
            {guardando ? textos.comun.guardando : t.guardar}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "reproduccion", seccion: "proximos" })}>
            {textos.comun.cancelar}
          </button>
        </div>
      </form>
    </section>
  );
}
