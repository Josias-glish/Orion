import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar, usePermiso, type SeccionPesos } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { Pestanas } from "../../componentes/Pestanas";
import { nombreDeAnimal, SelectorAnimal } from "../../componentes/SelectorAnimal";
import { useCarga } from "../../componentes/useCarga";
import { ErrorDeRegistro } from "../../datos/errores";
import { listarAnimales } from "../../datos/repositorios/animales";
import {
  guardarMeta,
  listarMetas,
  listarPesajesRecientes,
  pesajesDeAnimal,
  registrarPesaje,
  retirarMeta,
} from "../../datos/repositorios/pesos";
import { fechaLocal, formatearFecha } from "../../dominio/fechas";
import { leerKilos } from "../../dominio/leche";
import { TIPOS_PESAJE, type TipoPesaje } from "../../dominio/pesos";
import { SEXOS, type Sexo } from "../../dominio/tipos";
import { textos } from "../../textos/es";

const t = textos.pesos;

/** RF-30 y RF-31: peso corporal, ganancia diaria y metas por edad. */
export function Pesos({ seccion, animalId }: { seccion: SeccionPesos; animalId: string | null }) {
  const navegar = useNavegar();
  return (
    <section className="pantalla pantalla--ancha">
      <h1>{t.titulo}</h1>
      <Pestanas
        opciones={(["registrar", "metas"] as const).map((valor) => ({ valor, texto: t.secciones[valor] }))}
        actual={seccion}
        alElegir={(s) => navegar({ pantalla: "pesos", seccion: s })}
      />
      {seccion === "registrar" ? <RegistrarPesaje animalInicial={animalId} /> : <Metas />}
    </section>
  );
}

function RegistrarPesaje({ animalInicial }: { animalInicial: string | null }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const puedeRegistrar = usePermiso("registrar_peso");
  const { datos: animales } = useCarga(() => listarAnimales(conexion, { estado: "activo" }), [conexion]);
  const { datos: recientes, recargar } = useCarga(() => listarPesajesRecientes(conexion), [conexion]);
  const [animalId, setAnimalId] = useState<string | null>(animalInicial);
  const [fecha, setFecha] = useState(fechaLocal());
  const [kilos, setKilos] = useState("");
  const [tipo, setTipo] = useState<TipoPesaje>("control");
  const [error, setError] = useState<unknown>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const animal = animales?.find((a) => a.id === animalId);

  async function guardar() {
    setError(null);
    setExito(null);
    try {
      if (!animalId) throw new ErrorDeRegistro([{ codigo: "dato_obligatorio", campo: "animal_id" }]);
      const valor = leerKilos(kilos);
      if (valor === null || valor <= 0) throw new ErrorDeRegistro([{ codigo: "kilos_invalidos" }]);
      await registrarPesaje(conexion, { animalId, fecha, kilos: valor, tipo }, contexto());
      setExito(t.guardado(animal ? nombreDeAnimal(animal) : "", textos.comun.kilos(valor)));
      setKilos("");
      setVersion((v) => v + 1);
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  const c = t.columnas;
  return (
    <div>
      {puedeRegistrar && (
        <form
          className="tarjeta"
          onSubmit={(e) => {
            e.preventDefault();
            guardar();
          }}
          data-prueba="formulario-pesaje"
        >
          <ListaMotivos error={error} />
          {exito && <Aviso tipo="exito">{exito}</Aviso>}
          <div className="rejilla">
            <SelectorAnimal etiqueta={t.animal} candidatos={animales ?? []} valor={animalId} alCambiar={setAnimalId} prueba="pesaje-animal" />
            <Campo etiqueta={t.fecha} ancho="corto">
              <input type="date" value={fecha} max={fechaLocal()} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta={t.kilos} ancho="corto">
              <input inputMode="decimal" value={kilos} onChange={(e) => setKilos(e.target.value)} data-prueba="pesaje-kilos" />
            </Campo>
            <Campo etiqueta={t.tipo} ancho="corto">
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoPesaje)}>
                {TIPOS_PESAJE.map((v) => (
                  <option key={v} value={v}>
                    {textos.comun.tipoPesaje[v]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="acciones">
            <button type="submit" className="boton" data-prueba="guardar-pesaje">
              {t.guardar}
            </button>
          </div>
        </form>
      )}

      {animal && (
        <>
          <h2>
            <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: animal.id, pestana: "pesos" })}>
              {nombreDeAnimal(animal)}
            </button>
          </h2>
          <TablaPesajesAnimal key={`${animal.id}-${version}`} animalId={animal.id} />
        </>
      )}

      <h2>{t.recientesTitulo}</h2>
      {recientes === null ? (
        <p>{textos.comun.cargando}</p>
      ) : recientes.length === 0 ? (
        <p className="nota">{t.recientesVacio}</p>
      ) : (
        <table className="tabla" data-prueba="tabla-pesajes-recientes">
          <thead>
            <tr>
              <th>{c.fecha}</th>
              <th>{c.animal}</th>
              <th>{c.tipo}</th>
              <th className="numero">{c.kilos}</th>
            </tr>
          </thead>
          <tbody>
            {recientes.map((p) => (
              <tr key={p.id}>
                <td>{formatearFecha(p.fecha)}</td>
                <td>
                  <button type="button" className="enlace" onClick={() => setAnimalId(p.animalId)}>
                    {p.animal}
                  </button>
                </td>
                <td>{textos.comun.tipoPesaje[p.tipo]}</td>
                <td className="numero">{textos.comun.kilos(p.kilos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Pesajes de un animal con edad, ganancia diaria (R10) y comparación con la meta (RF-31). También va en la ficha. */
export function TablaPesajesAnimal({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const { datos: pesajes } = useCarga(() => pesajesDeAnimal(conexion, animalId), [conexion, animalId]);
  const c = t.columnas;
  if (pesajes === null) return <p>{textos.comun.cargando}</p>;
  if (pesajes.length === 0) return <p className="nota">{t.fichaVacio}</p>;
  return (
    <>
      <table className="tabla" data-prueba="tabla-pesajes-animal">
        <thead>
          <tr>
            <th>{c.fecha}</th>
            <th>{c.tipo}</th>
            <th className="numero">{c.edad}</th>
            <th className="numero">{c.kilos}</th>
            <th className="numero">{c.ganancia}</th>
            <th className="numero">{c.meta}</th>
            <th>{c.diferencia}</th>
          </tr>
        </thead>
        <tbody>
          {pesajes.map((p) => {
            const diferencia = p.meta === null ? null : p.kilos - p.meta;
            return (
              <tr key={p.id}>
                <td>{formatearFecha(p.fecha)}</td>
                <td>{textos.comun.tipoPesaje[p.tipo]}</td>
                <td className="numero">{p.edadDias === null ? textos.comun.sinDato : textos.comun.dias(p.edadDias)}</td>
                <td className="numero">{textos.comun.kilos(p.kilos)}</td>
                <td className="numero" data-prueba="ganancia">
                  {p.gananciaDiaria === null ? textos.comun.sinDato : t.gananciaPorDia(p.gananciaDiaria * 1000)}
                </td>
                <td className="numero">{p.meta === null ? textos.comun.sinDato : textos.comun.kilos(p.meta)}</td>
                <td>
                  {diferencia === null ? (
                    <span className="nota">{t.sinMeta}</span>
                  ) : diferencia >= 0 ? (
                    <span className="insignia insignia--activo">▲ {t.sobreMeta(textos.comun.kilos(diferencia))}</span>
                  ) : (
                    <span className="insignia insignia--aviso">▼ {t.bajoMeta(textos.comun.kilos(-diferencia))}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="nota">{t.gananciaAyuda}</p>
    </>
  );
}

function Metas() {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const puedeEditar = usePermiso("editar_metas_peso");
  const { datos: metas, recargar } = useCarga(() => listarMetas(conexion), [conexion]);
  const [sexo, setSexo] = useState<Sexo>("hembra");
  const [edad, setEdad] = useState("");
  const [kilos, setKilos] = useState("");
  const [error, setError] = useState<unknown>(null);
  const c = t.metasColumnas;

  async function ejecutar(accion: () => Promise<unknown>) {
    setError(null);
    try {
      await accion();
      await recargar();
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <p className="nota">{t.metasAyuda}</p>
      <ListaMotivos error={error} />
      {metas === null ? (
        <p>{textos.comun.cargando}</p>
      ) : metas.length === 0 ? (
        <p className="nota">{t.metasVacio}</p>
      ) : (
        <table className="tabla" data-prueba="tabla-metas">
          <thead>
            <tr>
              <th>{c.sexo}</th>
              <th className="numero">{c.edad}</th>
              <th className="numero">{c.kilos}</th>
              {puedeEditar && <th />}
            </tr>
          </thead>
          <tbody>
            {metas.map((m) => (
              <tr key={m.id}>
                <td>{textos.comun.sexo[m.sexo]}</td>
                <td className="numero">{m.edadMeses}</td>
                <td className="numero">{textos.comun.kilos(m.kilos)}</td>
                {puedeEditar && (
                  <td className="acciones-fila">
                    <button
                      type="button"
                      className="boton boton--secundario boton--pequeno"
                      onClick={() => ejecutar(() => retirarMeta(conexion, m.id, contexto()))}
                    >
                      {textos.comun.retirar}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {puedeEditar ? (
        <form
          className="fila-editable"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar(async () => {
              const edadMeses = edad.trim() === "" ? Number.NaN : Number(edad);
              await guardarMeta(conexion, { sexo, edadMeses, kilos: leerKilos(kilos) ?? Number.NaN }, contexto());
              setEdad("");
              setKilos("");
            });
          }}
          data-prueba="formulario-meta"
        >
          <Campo etiqueta={c.sexo} ancho="corto">
            <select value={sexo} onChange={(e) => setSexo(e.target.value as Sexo)}>
              {SEXOS.map((s) => (
                <option key={s} value={s}>
                  {textos.comun.sexo[s]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta={t.metaEdad} ancho="corto">
            <input inputMode="numeric" value={edad} onChange={(e) => setEdad(e.target.value)} data-prueba="meta-edad" />
          </Campo>
          <Campo etiqueta={t.metaKilos} ancho="corto">
            <input inputMode="decimal" value={kilos} onChange={(e) => setKilos(e.target.value)} data-prueba="meta-kilos" />
          </Campo>
          <button type="submit" className="boton">
            {textos.comun.guardar}
          </button>
        </form>
      ) : (
        <p className="nota">{t.metasSoloPropietario}</p>
      )}
    </div>
  );
}
