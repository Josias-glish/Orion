import { useEffect, useRef, useState } from "react";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { FotoAnimal } from "../../componentes/FotoAnimal";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { elegirYCopiarFoto } from "../../datos/fotos";
import {
  animalVacio,
  guardarAnimal,
  listarPosiblesPadres,
  obtenerAnimal,
  type DatosAnimal,
} from "../../datos/repositorios/animales";
import { listarCatalogo } from "../../datos/repositorios/catalogos";
import { listarLotes } from "../../datos/repositorios/lotes";
import type { IdentificadorEditable } from "../../dominio/identificadores";
import {
  ESTADOS_ANIMAL,
  FORMAS_CONCEPCION,
  SEXOS,
  TIPOS_IDENTIFICADOR,
  type EstadoAnimal,
  type FormaConcepcion,
  type TipoIdentificador,
} from "../../dominio/tipos";
import { textos } from "../../textos/es";

/** Fila de composición tal como se escribe (el porcentaje es texto mientras se edita: «12,5»). */
interface FilaRaza {
  clave: number;
  razaId: string;
  porcentaje: string;
}

/** Identificador en edición, con una clave estable para React. */
type FilaIdentificador = IdentificadorEditable & { clave: number };

let siguienteClave = 1;
const nuevaClave = () => siguienteClave++;

/** «12,5» o «12.5» → 0,125. Un texto que no es número da NaN y el dominio lo rechaza. */
const aFraccion = (texto: string) => Number(texto.replace(",", ".")) / 100;
const aTexto = (fraccion: number) => String(Number((fraccion * 100).toFixed(4))).replace(".", ",");

/** RF-01 a RF-03, RF-08, RF-11 y RF-13: registrar o editar un animal. */
export function FormularioAnimal({ id }: { id?: string }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const contexto = useContextoCambio();
  const t = textos.formulario;

  const { datos: catalogos } = useCarga(
    async () => ({
      animal: id ? await obtenerAnimal(conexion, id) : null,
      razas: await listarCatalogo(conexion, "raza"),
      libros: await listarCatalogo(conexion, "libro"),
      lotes: await listarLotes(conexion),
      machos: (await listarPosiblesPadres(conexion, "macho")).filter((a) => a.id !== id),
      hembras: (await listarPosiblesPadres(conexion, "hembra")).filter((a) => a.id !== id),
    }),
    [conexion, id],
  );

  const [datos, setDatos] = useState<DatosAnimal | null>(id ? null : animalVacio());
  const [identificadores, setIdentificadores] = useState<FilaIdentificador[]>([]);
  const [razas, setRazas] = useState<FilaRaza[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);
  const arriba = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const animal = catalogos?.animal;
    if (!animal) return;
    setDatos(animal);
    setIdentificadores(animal.identificadores.map((i) => ({ ...i, clave: nuevaClave() })));
    setRazas(animal.composicion.map((f) => ({ clave: nuevaClave(), razaId: f.razaId, porcentaje: aTexto(f.fraccion) })));
  }, [catalogos]);

  if (catalogos && id && !catalogos.animal) return <p className="aviso aviso--error">{textos.ficha.noExiste}</p>;
  if (!catalogos || !datos) return <p>{textos.comun.cargando}</p>;
  const cambiar = (cambio: Partial<DatosAnimal>) => setDatos({ ...datos, ...cambio });
  const sumaTexto = textos.comun.porcentaje(razas.reduce((s, r) => s + (aFraccion(r.porcentaje) || 0), 0) * 100);
  // Las razas y libros inactivos no se ofrecen, salvo que el animal ya los tenga.
  const razasVisibles = catalogos.razas.filter((r) => r.activo || razas.some((f) => f.razaId === r.id));
  const librosVisibles = catalogos.libros.filter((l) => l.activo || l.id === datos.libroId);

  async function guardar() {
    if (!datos) return;
    setGuardando(true);
    setError(null);
    try {
      const guardado = await guardarAnimal(
        conexion,
        {
          ...datos,
          identificadores: identificadores.map(({ clave: _clave, ...i }) => i),
          composicion: razas.filter((r) => r.razaId).map((r) => ({ razaId: r.razaId, fraccion: aFraccion(r.porcentaje) })),
        },
        contexto(),
        id,
      );
      navegar({ pantalla: "animal", id: guardado, pestana: "ficha" });
    } catch (e) {
      setError(e);
      setGuardando(false);
      arriba.current?.scrollIntoView();
    }
  }

  async function elegirFoto() {
    try {
      const ruta = await elegirYCopiarFoto(t.filtroImagenes);
      if (ruta) cambiar({ foto: ruta });
    } catch (e) {
      setError(e);
    }
  }

  const cambiarIdentificador = (clave: number, cambio: Partial<FilaIdentificador>) =>
    setIdentificadores(identificadores.map((i) => (i.clave === clave ? { ...i, ...cambio } : i)));
  const marcarPrincipal = (clave: number) =>
    setIdentificadores(identificadores.map((i) => ({ ...i, principal: i.clave === clave })));
  const cambiarRaza = (clave: number, cambio: Partial<FilaRaza>) =>
    setRazas(razas.map((r) => (r.clave === clave ? { ...r, ...cambio } : r)));

  return (
    <section className="pantalla pantalla--ancha">
      <h1 ref={arriba}>{id ? t.tituloEditar(catalogos.animal?.nombre ?? "") : t.tituloNuevo}</h1>
      <ListaMotivos error={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <fieldset className="tarjeta">
          <legend>{t.datosTitulo}</legend>
          <div className="rejilla">
            <Campo etiqueta={t.nombre}>
              <input value={datos.nombre ?? ""} onChange={(e) => cambiar({ nombre: e.target.value })} data-prueba="nombre" />
            </Campo>
            <div className="campo">
              <span className="campo__etiqueta">{t.sexo}</span>
              <div className="opciones">
                {SEXOS.map((s) => (
                  <label key={s} className="casilla">
                    <input type="radio" name="sexo" checked={datos.sexo === s} onChange={() => cambiar({ sexo: s })} data-prueba={`sexo-${s}`} />
                    <span>{textos.comun.sexo[s]}</span>
                  </label>
                ))}
              </div>
            </div>
            <Campo etiqueta={t.fechaNacimiento} ancho="corto">
              <input
                type="date"
                value={datos.fechaNacimiento ?? ""}
                onChange={(e) => cambiar({ fechaNacimiento: e.target.value || null })}
                data-prueba="fecha-nacimiento"
              />
            </Campo>
            <Campo etiqueta={t.estado} ancho="corto">
              <select value={datos.estado} onChange={(e) => cambiar({ estado: e.target.value as EstadoAnimal })}>
                {ESTADOS_ANIMAL.map((s) => (
                  <option key={s} value={s}>
                    {textos.comun.estado[s]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={t.colorSenas} ancho="largo">
              <input value={datos.colorSenas ?? ""} onChange={(e) => cambiar({ colorSenas: e.target.value })} />
            </Campo>
            <div className="campo campo--largo">
              <Casilla etiqueta={t.enHato} marcada={datos.enHato} alCambiar={(v) => cambiar({ enHato: v })} prueba="en-hato" />
              <span className="campo__ayuda">{t.enHatoAyuda}</span>
            </div>
          </div>
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.fotoTitulo}</legend>
          <div className="ficha-con-foto">
            <FotoAnimal ruta={datos.foto} alt={datos.nombre ?? ""} />
            <div className="acciones">
              <button type="button" className="boton boton--secundario" onClick={elegirFoto}>
                {t.elegirFoto}
              </button>
              {datos.foto && (
                <button type="button" className="boton boton--secundario" onClick={() => cambiar({ foto: null })}>
                  {t.quitarFoto}
                </button>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.identificadoresTitulo}</legend>
          <p className="nota">{t.identificadoresAyuda}</p>
          {identificadores.map((i) => (
            <div key={i.clave} className="fila-editable" data-prueba="fila-identificador">
              <Campo etiqueta={t.tipo} ancho="corto">
                <select value={i.tipo} onChange={(e) => cambiarIdentificador(i.clave, { tipo: e.target.value as TipoIdentificador })}>
                  {TIPOS_IDENTIFICADOR.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {textos.comun.tipoIdentificador[tipo]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta={t.valor} ancho="corto">
                <input value={i.valor} onChange={(e) => cambiarIdentificador(i.clave, { valor: e.target.value })} data-prueba="identificador-valor" />
              </Campo>
              <Campo etiqueta={t.fecha} ancho="corto">
                <input type="date" value={i.fecha ?? ""} onChange={(e) => cambiarIdentificador(i.clave, { fecha: e.target.value || null })} />
              </Campo>
              <Casilla etiqueta={t.vigente} marcada={i.vigente} alCambiar={(v) => cambiarIdentificador(i.clave, { vigente: v })} />
              <label className="casilla">
                <input type="radio" name="principal" checked={i.principal} onChange={() => marcarPrincipal(i.clave)} />
                <span>{t.principal}</span>
              </label>
              <button
                type="button"
                className="boton boton--secundario boton--pequeno"
                onClick={() => setIdentificadores(identificadores.filter((x) => x.clave !== i.clave))}
              >
                {textos.comun.quitar}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() =>
              setIdentificadores([
                ...identificadores,
                {
                  clave: nuevaClave(),
                  tipo: "arete",
                  valor: "",
                  fecha: null,
                  vigente: true,
                  principal: !identificadores.some((x) => x.principal),
                },
              ])
            }
            data-prueba="agregar-identificador"
          >
            {t.agregarIdentificador}
          </button>
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.razaTitulo}</legend>
          <p className="nota">{t.razaAyuda}</p>
          {razas.map((r) => (
            <div key={r.clave} className="fila-editable" data-prueba="fila-raza">
              <Campo etiqueta={t.raza}>
                <select value={r.razaId} onChange={(e) => cambiarRaza(r.clave, { razaId: e.target.value })} data-prueba="raza">
                  <option value="">{t.elegirRaza}</option>
                  {razasVisibles.map((raza) => (
                    <option key={raza.id} value={raza.id}>
                      {raza.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta={t.porcentaje} ancho="corto">
                <input
                  inputMode="decimal"
                  value={r.porcentaje}
                  onChange={(e) => cambiarRaza(r.clave, { porcentaje: e.target.value })}
                  data-prueba="porcentaje"
                />
              </Campo>
              <button
                type="button"
                className="boton boton--secundario boton--pequeno"
                onClick={() => setRazas(razas.filter((x) => x.clave !== r.clave))}
              >
                {textos.comun.quitar}
              </button>
            </div>
          ))}
          {razas.length > 0 && (
            <p className="destacado" data-prueba="suma-razas">
              {t.suma(sumaTexto)}
            </p>
          )}
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => setRazas([...razas, { clave: nuevaClave(), razaId: "", porcentaje: razas.length === 0 ? "100" : "" }])}
            data-prueba="agregar-raza"
          >
            {t.agregarRaza}
          </button>
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.registroTitulo}</legend>
          <div className="rejilla">
            <Campo etiqueta={t.libro}>
              <select value={datos.libroId ?? ""} onChange={(e) => cambiar({ libroId: e.target.value || null })}>
                <option value="">{t.sinLibro}</option>
                {librosVisibles.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={t.formaConcepcion}>
              <select
                value={datos.formaConcepcion ?? ""}
                onChange={(e) => cambiar({ formaConcepcion: (e.target.value || null) as FormaConcepcion | null })}
              >
                <option value="">{t.sinFormaConcepcion}</option>
                {FORMAS_CONCEPCION.map((f) => (
                  <option key={f} value={f}>
                    {textos.comun.formaConcepcion[f]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={t.lote}>
              <select value={datos.loteId ?? ""} onChange={(e) => cambiar({ loteId: e.target.value || null })}>
                <option value="">{t.sinLote}</option>
                {catalogos.lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.genealogiaTitulo}</legend>
          <p className="nota">{t.genealogiaAyuda}</p>
          <div className="rejilla">
            <div>
              <SelectorAnimal
                etiqueta={t.padre}
                candidatos={catalogos.machos}
                valor={datos.padreId}
                alCambiar={(padreId) => cambiar({ padreId, padreSinVerificar: padreId ? datos.padreSinVerificar : false })}
                prueba="padre"
              />
              {datos.padreId && (
                <Casilla
                  etiqueta={t.sinVerificar}
                  marcada={datos.padreSinVerificar}
                  alCambiar={(v) => cambiar({ padreSinVerificar: v })}
                  prueba="padre-sin-verificar"
                />
              )}
            </div>
            <div>
              <SelectorAnimal
                etiqueta={t.madre}
                candidatos={catalogos.hembras}
                valor={datos.madreId}
                alCambiar={(madreId) => cambiar({ madreId, madreSinVerificar: madreId ? datos.madreSinVerificar : false })}
                prueba="madre"
              />
              {datos.madreId && (
                <Casilla
                  etiqueta={t.sinVerificar}
                  marcada={datos.madreSinVerificar}
                  alCambiar={(v) => cambiar({ madreSinVerificar: v })}
                  prueba="madre-sin-verificar"
                />
              )}
            </div>
          </div>
        </fieldset>

        <fieldset className="tarjeta">
          <legend>{t.observaciones}</legend>
          <textarea rows={3} value={datos.observaciones ?? ""} onChange={(e) => cambiar({ observaciones: e.target.value })} />
        </fieldset>

        <div className="acciones acciones--fijas">
          <button
            type="button"
            className="boton boton--secundario"
            onClick={() => navegar(id ? { pantalla: "animal", id, pestana: "ficha" } : { pantalla: "animales" })}
          >
            {textos.comun.cancelar}
          </button>
          <button type="submit" className="boton" disabled={guardando} data-prueba="guardar">
            {guardando ? textos.comun.guardando : textos.comun.guardar}
          </button>
        </div>
      </form>
    </section>
  );
}
