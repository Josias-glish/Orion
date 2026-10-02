import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { elegirYCopiarAdjunto } from "../../datos/archivos";
import { animalVacio, listarExternos, listarPosiblesPadres, type DatosAnimal } from "../../datos/repositorios/animales";
import { listarCatalogo } from "../../datos/repositorios/catalogos";
import { listarContactos } from "../../datos/repositorios/contactos";
import { listarLotes } from "../../datos/repositorios/lotes";
import { registrarCompra, type DatosCompra, type ResultadoTraspaso } from "../../datos/repositorios/traspasos";
import { fechaLocal } from "../../dominio/fechas";
import { leerPesos } from "../../dominio/finanzas";
import { SEXOS } from "../../dominio/tipos";
import { textos } from "../../textos/es";
import { FormularioContacto } from "../animales/FormularioContacto";

const t = textos.traspasos.compra;
const f = textos.formulario;

let siguienteClave = 1;
const nuevaClave = () => siguienteClave++;

/** «12,5» o «12.5» → 0,125. Un texto que no es número da NaN y el dominio lo rechaza. */
const aFraccion = (texto: string) => Number(texto.replace(",", ".")) / 100;

interface FilaRaza {
  clave: number;
  razaId: string;
  porcentaje: string;
}

/** Un padre o una madre que no están en la finca y se cargan como animales de otras fincas (R29). */
interface AncestroEscrito {
  nombre: string;
  registro: string;
  nacimiento: string;
  propietarioId: string;
}

const ancestroVacio = (): AncestroEscrito => ({ nombre: "", registro: "", nacimiento: "", propietarioId: "" });

/** El ancestro tal como lo pide la compra: un animal de otra finca (R29) con su registro de asociación como identificador. */
function comoDatosDeAncestro(a: AncestroEscrito, sexo: "macho" | "hembra"): DatosAnimal {
  const registro = a.registro.trim();
  return {
    ...animalVacio(),
    nombre: a.nombre.trim() || null,
    sexo,
    origen: "externo",
    enHato: false,
    fechaNacimiento: a.nacimiento || null,
    contactoId: a.propietarioId || null,
    identificadores: registro ? [{ tipo: "registro_asociacion", valor: registro, fecha: null, vigente: true, principal: true }] : [],
  };
}

type ModoAnimal = "existente" | "nuevo";

/**
 * RF-50 (R32): registrar la compra de un animal. Se elige un animal de otra finca que ya está registrado (se promueve a
 * comprado y conserva su ficha y su genealogía) o se crea uno nuevo. Solo el propietario (R23): la ruta exige
 * `gestionar_traspasos`.
 */
export function RegistrarCompra({ animalInicial }: { animalInicial: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();

  const { datos: catalogos } = useCarga(
    async () => ({
      externos: await listarExternos(conexion),
      razas: (await listarCatalogo(conexion, "raza")).filter((r) => r.activo),
      libros: (await listarCatalogo(conexion, "libro")).filter((l) => l.activo),
      lotes: await listarLotes(conexion),
      contactos: await listarContactos(conexion),
      machos: await listarPosiblesPadres(conexion, "macho"),
      hembras: await listarPosiblesPadres(conexion, "hembra"),
    }),
    [conexion],
  );

  const [modo, setModo] = useState<ModoAnimal>(animalInicial ? "existente" : "nuevo");
  const [existenteId, setExistenteId] = useState<string | null>(animalInicial);
  const [nuevo, setNuevo] = useState<DatosAnimal>(animalVacio);
  const [arete, setArete] = useState("");
  const [razas, setRazas] = useState<FilaRaza[]>([]);
  const [padre, setPadre] = useState<AncestroEscrito | null>(null);
  const [madre, setMadre] = useState<AncestroEscrito | null>(null);
  const [contactos, setContactos] = useState<NonNullable<typeof catalogos>["contactos"] | null>(null);
  const [agregandoContacto, setAgregandoContacto] = useState(false);
  const [vendedorId, setVendedorId] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(fechaLocal());
  const [precio, setPrecio] = useState("");
  const [registro, setRegistro] = useState("");
  const [loteId, setLoteId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [adjuntos, setAdjuntos] = useState<string[]>([]);
  const [crearGasto, setCrearGasto] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ datos: ResultadoTraspaso; nombre: string } | null>(null);

  if (!catalogos) return <p>{textos.comun.cargando}</p>;
  const listaContactos = contactos ?? catalogos.contactos;
  const etiquetaContacto = (c: { nombre: string; criadero: string | null }) => (c.criadero ? `${c.nombre} · ${c.criadero}` : c.nombre);
  const externoElegido = catalogos.externos.find((e) => e.id === existenteId) ?? null;
  const precioLeido = precio.trim() === "" ? null : (leerPesos(precio) ?? Number.NaN);
  const hayPrecio = precioLeido !== null && Number.isSafeInteger(precioLeido) && precioLeido > 0;
  const vendedor = listaContactos.find((c) => c.id === vendedorId) ?? null;
  const sumaTexto = textos.comun.porcentaje(razas.reduce((s, r) => s + (aFraccion(r.porcentaje) || 0), 0) * 100);
  const cambiarNuevo = (cambio: Partial<DatosAnimal>) => setNuevo({ ...nuevo, ...cambio });
  const cambiarRaza = (clave: number, cambio: Partial<FilaRaza>) => setRazas(razas.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));

  async function agregarAdjunto() {
    setError(null);
    try {
      const ruta = await elegirYCopiarAdjunto(textos.traspasos.filtroAdjunto);
      if (ruta) setAdjuntos([...adjuntos, ruta]);
    } catch (e) {
      setError(e);
    }
  }

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const esExistente = modo === "existente";
      const nombre = esExistente ? (externoElegido?.nombre ?? externoElegido?.identificador ?? "") : (nuevo.nombre?.trim() ?? "") || arete.trim();
      const datos: DatosCompra = {
        animalId: esExistente ? existenteId : null,
        nuevo: esExistente
          ? null
          : {
              ...nuevo,
              identificadores: arete.trim() ? [{ tipo: "arete", valor: arete.trim(), fecha: null, vigente: true, principal: true }] : [],
              composicion: razas.filter((r) => r.razaId).map((r) => ({ razaId: r.razaId, fraccion: aFraccion(r.porcentaje) })),
            },
        padreNuevo: !esExistente && padre ? comoDatosDeAncestro(padre, "macho") : null,
        madreNuevo: !esExistente && madre ? comoDatosDeAncestro(madre, "hembra") : null,
        vendedorId: vendedorId || null,
        fechaIngreso,
        precio: precioLeido,
        registroAsociacion: registro.trim() || null,
        adjuntos,
        observaciones: observaciones.trim() || null,
        loteId: loteId || null,
        crearGasto: crearGasto && hayPrecio,
        descripcionMovimiento: textos.traspasos.descripcionGasto(nombre, vendedor ? vendedor.nombre : ""),
      };
      const hecho = await registrarCompra(conexion, datos, contexto());
      setResultado({ datos: hecho, nombre });
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  }

  if (resultado) {
    return (
      <section className="pantalla pantalla--ancha" data-prueba="compra-registrada">
        <h1>{t.titulo}</h1>
        <Aviso tipo="exito">
          <span data-prueba="compra-listo">{t.listo(resultado.nombre)}</span>
          {resultado.datos.movimientoId && <span> {textos.traspasos.movimientoAnotado(textos.traspasos.gasto, textos.comun.pesos(precioLeido ?? 0))}</span>}
        </Aviso>
        <div className="acciones">
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "animal", id: resultado.datos.animalId, pestana: "ficha" })} data-prueba="compra-ver-ficha">
            {t.irAFicha}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "traspasos" })} data-prueba="compra-ver-historial">
            {textos.traspasos.elHistorial}
          </button>
          <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "registrarCompra" })} data-prueba="compra-otra">
            {t.otraCompra}
          </button>
        </div>
      </section>
    );
  }

  const campoAncestro = (
    cual: "padre" | "madre",
    valor: AncestroEscrito,
    alCambiar: (a: AncestroEscrito | null) => void,
  ) => (
    <fieldset className="tarjeta" data-prueba={`ancestro-${cual}`}>
      <legend>{cual === "padre" ? t.padreTitulo : t.madreTitulo}</legend>
      <div className="rejilla">
        <Campo etiqueta={t.ancestroNombre}>
          <input value={valor.nombre} onChange={(e) => alCambiar({ ...valor, nombre: e.target.value })} data-prueba={`${cual}-nombre`} />
        </Campo>
        <Campo etiqueta={t.ancestroRegistro}>
          <input value={valor.registro} onChange={(e) => alCambiar({ ...valor, registro: e.target.value })} data-prueba={`${cual}-registro`} />
        </Campo>
        <Campo etiqueta={t.ancestroNacimiento} ancho="corto">
          <input type="date" value={valor.nacimiento} max={fechaLocal()} onChange={(e) => alCambiar({ ...valor, nacimiento: e.target.value })} data-prueba={`${cual}-nacimiento`} />
        </Campo>
        <Campo etiqueta={t.ancestroPropietario} ayuda={t.ancestroPropietarioAyuda}>
          <select value={valor.propietarioId} onChange={(e) => alCambiar({ ...valor, propietarioId: e.target.value })} data-prueba={`${cual}-propietario`}>
            <option value="">{t.elegirVendedor}</option>
            {listaContactos.map((c) => (
              <option key={c.id} value={c.id}>
                {etiquetaContacto(c)}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => alCambiar(null)} data-prueba={`${cual}-quitar`}>
        {t.quitarAncestro}
      </button>
    </fieldset>
  );

  return (
    <section className="pantalla pantalla--ancha" data-prueba="pantalla-compra">
      <h1>{externoElegido && modo === "existente" ? t.tituloAnimal(externoElegido.nombre ?? externoElegido.identificador ?? textos.animales.sinNombre) : t.titulo}</h1>
      <p className="nota">{t.ayuda}</p>
      <ListaMotivos error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <fieldset className="tarjeta">
          <legend>{t.cual}</legend>
          <div className="opciones opciones--columna">
            <label className="casilla">
              <input type="radio" name="modo-compra" checked={modo === "existente"} onChange={() => setModo("existente")} data-prueba="compra-existente" />
              <span>{t.existente}</span>
            </label>
            <label className="casilla">
              <input type="radio" name="modo-compra" checked={modo === "nuevo"} onChange={() => setModo("nuevo")} data-prueba="compra-nuevo" />
              <span>{t.nuevo}</span>
            </label>
          </div>
          {modo === "existente" &&
            (catalogos.externos.length === 0 ? (
              <p className="nota">{t.sinExternos}</p>
            ) : (
              <SelectorAnimal etiqueta={t.elegirAnimal} candidatos={catalogos.externos} valor={existenteId} alCambiar={setExistenteId} prueba="compra-animal" />
            ))}
        </fieldset>

        {modo === "nuevo" && (
          <>
            <fieldset className="tarjeta">
              <legend>{t.datosDelAnimal}</legend>
              <div className="rejilla">
                <Campo etiqueta={f.nombre}>
                  <input value={nuevo.nombre ?? ""} onChange={(e) => cambiarNuevo({ nombre: e.target.value })} data-prueba="compra-nombre" />
                </Campo>
                <div className="campo">
                  <span className="campo__etiqueta">{f.sexo}</span>
                  <div className="opciones">
                    {SEXOS.map((s) => (
                      <label key={s} className="casilla">
                        <input type="radio" name="sexo-compra" checked={nuevo.sexo === s} onChange={() => cambiarNuevo({ sexo: s })} data-prueba={`compra-sexo-${s}`} />
                        <span>{textos.comun.sexo[s]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Campo etiqueta={f.fechaNacimiento} ancho="corto">
                  <input
                    type="date"
                    value={nuevo.fechaNacimiento ?? ""}
                    max={fechaLocal()}
                    onChange={(e) => cambiarNuevo({ fechaNacimiento: e.target.value || null })}
                    data-prueba="compra-nacimiento"
                  />
                </Campo>
                <Campo etiqueta={t.arete} ayuda={t.areteAyuda} ancho="corto">
                  <input value={arete} onChange={(e) => setArete(e.target.value)} data-prueba="compra-arete" />
                </Campo>
                <Campo etiqueta={f.colorSenas} ancho="largo">
                  <input value={nuevo.colorSenas ?? ""} onChange={(e) => cambiarNuevo({ colorSenas: e.target.value })} />
                </Campo>
                <Campo etiqueta={f.libro}>
                  <select value={nuevo.libroId ?? ""} onChange={(e) => cambiarNuevo({ libroId: e.target.value || null })} data-prueba="compra-libro">
                    <option value="">{f.sinLibro}</option>
                    {catalogos.libros.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                </Campo>
              </div>
            </fieldset>

            <fieldset className="tarjeta">
              <legend>{f.razaTitulo}</legend>
              <p className="nota">{f.razaAyuda}</p>
              {razas.map((r) => (
                <div key={r.clave} className="fila-editable" data-prueba="compra-fila-raza">
                  <Campo etiqueta={f.raza}>
                    <select value={r.razaId} onChange={(e) => cambiarRaza(r.clave, { razaId: e.target.value })} data-prueba="compra-raza">
                      <option value="">{f.elegirRaza}</option>
                      {catalogos.razas.map((raza) => (
                        <option key={raza.id} value={raza.id}>
                          {raza.nombre}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Campo etiqueta={f.porcentaje} ancho="corto">
                    <input inputMode="decimal" value={r.porcentaje} onChange={(e) => cambiarRaza(r.clave, { porcentaje: e.target.value })} data-prueba="compra-porcentaje" />
                  </Campo>
                  <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setRazas(razas.filter((x) => x.clave !== r.clave))}>
                    {textos.comun.quitar}
                  </button>
                </div>
              ))}
              {razas.length > 0 && <p className="destacado">{f.suma(sumaTexto)}</p>}
              <button
                type="button"
                className="boton boton--secundario"
                onClick={() => setRazas([...razas, { clave: nuevaClave(), razaId: "", porcentaje: razas.length === 0 ? "100" : "" }])}
                data-prueba="compra-agregar-raza"
              >
                {f.agregarRaza}
              </button>
            </fieldset>

            <fieldset className="tarjeta">
              <legend>{f.genealogiaTitulo}</legend>
              <p className="nota">{t.ancestrosAyuda}</p>
              {padre ? (
                campoAncestro("padre", padre, setPadre)
              ) : (
                <div>
                  <SelectorAnimal
                    etiqueta={f.padre}
                    candidatos={catalogos.machos}
                    valor={nuevo.padreId}
                    alCambiar={(padreId) => cambiarNuevo({ padreId, padreSinVerificar: padreId ? nuevo.padreSinVerificar : false })}
                    prueba="compra-padre"
                  />
                  {nuevo.padreId && (
                    <Casilla etiqueta={f.sinVerificar} marcada={nuevo.padreSinVerificar} alCambiar={(v) => cambiarNuevo({ padreSinVerificar: v })} />
                  )}
                  {!nuevo.padreId && (
                    <button type="button" className="boton boton--secundario" onClick={() => setPadre(ancestroVacio())} data-prueba="cargar-padre">
                      {t.cargarPadre}
                    </button>
                  )}
                </div>
              )}
              {madre ? (
                campoAncestro("madre", madre, setMadre)
              ) : (
                <div>
                  <SelectorAnimal
                    etiqueta={f.madre}
                    candidatos={catalogos.hembras}
                    valor={nuevo.madreId}
                    alCambiar={(madreId) => cambiarNuevo({ madreId, madreSinVerificar: madreId ? nuevo.madreSinVerificar : false })}
                    prueba="compra-madre"
                  />
                  {nuevo.madreId && (
                    <Casilla etiqueta={f.sinVerificar} marcada={nuevo.madreSinVerificar} alCambiar={(v) => cambiarNuevo({ madreSinVerificar: v })} />
                  )}
                  {!nuevo.madreId && (
                    <button type="button" className="boton boton--secundario" onClick={() => setMadre(ancestroVacio())} data-prueba="cargar-madre">
                      {t.cargarMadre}
                    </button>
                  )}
                </div>
              )}
            </fieldset>
          </>
        )}

        <fieldset className="tarjeta">
          <legend>{t.datosTitulo}</legend>
          {agregandoContacto ? (
            <FormularioContacto
              alGuardar={async (id) => {
                setContactos(await listarContactos(conexion));
                setVendedorId(id);
                setAgregandoContacto(false);
              }}
              alCancelar={() => setAgregandoContacto(false)}
            />
          ) : (
            <div className="rejilla">
              <Campo etiqueta={t.vendedor} ayuda={t.vendedorAyuda}>
                <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} data-prueba="compra-vendedor">
                  <option value="">{t.elegirVendedor}</option>
                  {listaContactos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {etiquetaContacto(c)}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="campo">
                <span className="campo__etiqueta">&nbsp;</span>
                <button type="button" className="boton boton--secundario" onClick={() => setAgregandoContacto(true)} data-prueba="compra-agregar-vendedor">
                  {t.agregarVendedor}
                </button>
              </div>
            </div>
          )}
          <div className="rejilla">
            <Campo etiqueta={t.fechaIngreso} ayuda={t.fechaIngresoAyuda} ancho="corto">
              <input type="date" value={fechaIngreso} max={fechaLocal()} onChange={(e) => setFechaIngreso(e.target.value)} data-prueba="compra-fecha" />
            </Campo>
            <Campo etiqueta={t.precio} ayuda={t.precioAyuda} ancho="corto">
              <input inputMode="numeric" autoComplete="off" value={precio} onChange={(e) => setPrecio(e.target.value)} data-prueba="compra-precio" />
            </Campo>
            <Campo etiqueta={t.registroAsociacion} ayuda={t.registroAsociacionAyuda}>
              <input value={registro} onChange={(e) => setRegistro(e.target.value)} data-prueba="compra-registro" />
            </Campo>
            <Campo etiqueta={t.lote} ancho="corto">
              <select value={loteId} onChange={(e) => setLoteId(e.target.value)} data-prueba="compra-lote">
                <option value="">{t.sinLote}</option>
                {catalogos.lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={t.observaciones} ancho="largo">
              <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} data-prueba="compra-observaciones" />
            </Campo>
          </div>
          {hayPrecio && (
            <div>
              <Casilla etiqueta={t.crearGasto} marcada={crearGasto} alCambiar={setCrearGasto} prueba="compra-crear-gasto" />
              <p className="nota">{t.crearGastoAyuda}</p>
            </div>
          )}
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.adjuntosTitulo}</legend>
          <p className="nota">{t.adjuntosAyuda}</p>
          <p className="nota">{t.sinCertificados}</p>
          {adjuntos.length > 0 && (
            <ul className="lista-simple" data-prueba="compra-adjuntos">
              {adjuntos.map((ruta) => (
                <li key={ruta}>
                  <span>{t.adjuntoNombre(ruta)}</span>{" "}
                  <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => setAdjuntos(adjuntos.filter((a) => a !== ruta))}>
                    {t.quitarAdjunto}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="boton boton--secundario" onClick={agregarAdjunto} data-prueba="compra-agregar-adjunto">
            {t.agregarAdjunto}
          </button>
        </fieldset>

        <div className="acciones acciones--fijas">
          <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "animales", vista: modo === "existente" ? "externos" : "hato" })}>
            {textos.comun.cancelar}
          </button>
          <button type="submit" className="boton" disabled={guardando || (modo === "existente" && !existenteId)} data-prueba="guardar-compra">
            {guardando ? t.guardando : t.guardar}
          </button>
        </div>
      </form>
    </section>
  );
}
