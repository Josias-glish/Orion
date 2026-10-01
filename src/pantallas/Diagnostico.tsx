// Pantalla temporal de la Etapa 1: prueba técnica de la base de datos.
import { useCallback, useEffect, useState } from "react";
import { Aviso } from "../componentes/Aviso";
import { contextoDeCambio, useConexion } from "../componentes/ConexionContexto";
import { mensajeDeError } from "../componentes/mensajeDeError";
import {
  consultarEstado,
  crearAnimalDePrueba,
  crearTresGeneraciones,
  listarAnimalesDePrueba,
  retirarDatosDePrueba,
  type EstadoBaseDatos,
} from "../datos/diagnostico";
import { consultarAncestros, listarAnimales, type AnimalResumen, type Ancestro } from "../datos/repositorios/animales";
import { rutaBaseDatos } from "../datos/ubicacion";
import { formatearFecha, formatearMarcaDeTiempo } from "../dominio/fechas";
import { textos } from "../textos/es";

const t = textos.diagnostico;

type Resultado = { tipo: "exito"; texto: string } | { tipo: "error"; texto: string; detalle: string | null };

export function Diagnostico() {
  const conexion = useConexion();
  const [estado, setEstado] = useState<EstadoBaseDatos | null>(null);
  const [ruta, setRuta] = useState<string | null>(null);
  const [todos, setTodos] = useState<AnimalResumen[]>([]);
  const [dePrueba, setDePrueba] = useState<AnimalResumen[] | null>(null);
  const [elegido, setElegido] = useState("");
  const [ancestros, setAncestros] = useState<Ancestro[] | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmandoRetiro, setConfirmandoRetiro] = useState(false);

  const recargar = useCallback(async () => {
    const [nuevoEstado, lista, listaPrueba] = await Promise.all([
      consultarEstado(conexion),
      listarAnimales(conexion),
      listarAnimalesDePrueba(conexion),
    ]);
    setEstado(nuevoEstado);
    setTodos(lista);
    setDePrueba(listaPrueba);
  }, [conexion]);

  useEffect(() => {
    recargar();
    rutaBaseDatos().then(setRuta);
  }, [recargar]);

  /** Ejecuta una acción, muestra su resultado y vuelve a leer la base. */
  async function ejecutar(accion: () => Promise<string>) {
    setOcupado(true);
    setResultado(null);
    try {
      const texto = await accion();
      setResultado({ tipo: "exito", texto });
    } catch (error) {
      const { mensaje, detalle } = mensajeDeError(error);
      setResultado({ tipo: "error", texto: mensaje, detalle });
    } finally {
      await recargar();
      setOcupado(false);
    }
  }

  const pruebaA = () =>
    ejecutar(async () => {
      const id = await crearAnimalDePrueba(conexion, contextoDeCambio());
      const animal = (await listarAnimales(conexion)).find((a) => a.id === id);
      return t.resultadoA(animal?.nombre ?? id, animal?.identificador ?? "");
    });

  const pruebaB = () =>
    ejecutar(async () => {
      const criaId = await crearTresGeneraciones(conexion, contextoDeCambio());
      const cria = (await listarAnimales(conexion)).find((a) => a.id === criaId);
      setElegido(criaId);
      setAncestros(null);
      return t.resultadoB(cria?.nombre ?? criaId);
    });

  const pruebaC = () =>
    ejecutar(async () => {
      const lista = await consultarAncestros(conexion, elegido);
      setAncestros(lista);
      return t.cantidadAncestros(lista.length);
    });

  const retirar = () =>
    ejecutar(async () => {
      setConfirmandoRetiro(false);
      setAncestros(null);
      setElegido("");
      return t.resultadoRetirar(await retirarDatosDePrueba(conexion, contextoDeCambio()));
    });

  return (
    <section className="pantalla">
      <h1>{t.titulo}</h1>
      <Aviso tipo="info">{t.aviso}</Aviso>

      {resultado && (
        <Aviso tipo={resultado.tipo}>
          <span data-prueba="resultado">{resultado.texto}</span>
          {resultado.tipo === "error" && resultado.detalle && (
            <details>
              <summary>{textos.errores.detalleTecnico}</summary>
              <code>{resultado.detalle}</code>
            </details>
          )}
        </Aviso>
      )}

      <div className="tarjeta">
        <h2>{t.estadoTitulo}</h2>
        {estado ? (
          <dl className="ficha">
            <dt>{t.archivo}</dt>
            <dd className="ruta">{ruta ?? textos.comun.cargando}</dd>
            <dt>{t.versionSqlite}</dt>
            <dd>{estado.versionSqlite}</dd>
            <dt>{t.clavesForaneas}</dt>
            <dd>{estado.clavesForaneasActivas ? textos.comun.si : textos.comun.no}</dd>
            <dt>{t.migraciones}</dt>
            <dd data-prueba="migraciones">
              {estado.migraciones.length === 0
                ? t.ningunaMigracion
                : estado.migraciones.map((m) => `${m.version} · ${m.descripcion}`).join(", ")}
            </dd>
            <dt>{t.catalogosTitulo}</dt>
            <dd>{t.catalogos(estado.razas, estado.libros)}</dd>
            <dt>{t.totalAnimales}</dt>
            <dd data-prueba="total-animales">{estado.animales}</dd>
          </dl>
        ) : (
          <p>{textos.comun.cargando}</p>
        )}
      </div>

      <div className="tarjeta">
        <h2>{t.pruebaA}</h2>
        <p>{t.pruebaAExplicacion}</p>
        <button type="button" className="boton" onClick={pruebaA} disabled={ocupado} data-prueba="boton-a">
          {t.botonA}
        </button>
      </div>

      <div className="tarjeta">
        <h2>{t.pruebaB}</h2>
        <p>{t.pruebaBExplicacion}</p>
        <button type="button" className="boton" onClick={pruebaB} disabled={ocupado} data-prueba="boton-b">
          {t.botonB}
        </button>
      </div>

      <div className="tarjeta">
        <h2>{t.pruebaC}</h2>
        <p>{t.pruebaCExplicacion}</p>
        <div className="fila">
          <label className="campo">
            <span>{t.elegirAnimal}</span>
            <select
              value={elegido}
              onChange={(e) => {
                setElegido(e.target.value);
                setAncestros(null);
              }}
              data-prueba="elegir-animal"
            >
              <option value="">{t.opcionElegir}</option>
              {todos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre ?? textos.animales.sinNombre}
                  {a.identificador ? ` (${a.identificador})` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="boton"
            onClick={pruebaC}
            disabled={ocupado || !elegido}
            data-prueba="boton-c"
          >
            {t.botonC}
          </button>
        </div>
        {ancestros?.length === 0 && <p className="nota">{t.sinAncestros}</p>}
        {ancestros && ancestros.length > 0 && (
          <table className="tabla" data-prueba="tabla-ancestros">
            <thead>
              <tr>
                <th>{t.columnas.parentesco}</th>
                <th>{t.columnas.nombre}</th>
                <th>{t.columnas.identificador}</th>
                <th>{t.columnas.nacimiento}</th>
                <th>{t.columnas.generacion}</th>
              </tr>
            </thead>
            <tbody>
              {ancestros.map((a) => (
                <tr key={a.camino}>
                  <td>{textos.parentesco(a.camino)}</td>
                  <td>{a.nombre ?? textos.animales.sinNombre}</td>
                  <td>{a.identificador ?? textos.comun.sinDato}</td>
                  <td>{a.fechaNacimiento ? formatearFecha(a.fechaNacimiento) : textos.comun.sinDato}</td>
                  <td>{a.generacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="tarjeta">
        <h2>{t.pruebaD}</h2>
        <ol>
          {t.pruebaDPasos.map((paso) => (
            <li key={paso}>{paso}</li>
          ))}
        </ol>
        <p className="destacado" data-prueba="cantidad-prueba">
          {dePrueba ? t.animalesDePrueba(dePrueba.length) : textos.comun.cargando}
        </p>
        {dePrueba && dePrueba.length > 0 && (
          <table className="tabla" data-prueba="tabla-prueba">
            <thead>
              <tr>
                <th>{textos.animales.columnas.nombre}</th>
                <th>{textos.animales.columnas.identificador}</th>
                <th>{t.creadoEn}</th>
              </tr>
            </thead>
            <tbody>
              {dePrueba.map((a) => (
                <tr key={a.id}>
                  <td>{a.nombre ?? textos.animales.sinNombre}</td>
                  <td>{a.identificador ?? textos.comun.sinDato}</td>
                  <td>{formatearMarcaDeTiempo(a.creadoEn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dePrueba && dePrueba.length > 0 && (
        <div className="tarjeta">
          <h2>{t.retirarTitulo}</h2>
          <p>{t.retirarExplicacion}</p>
          {confirmandoRetiro ? (
            <div className="confirmacion">
              <p className="destacado">{t.confirmarRetirar(dePrueba.length)}</p>
              <div className="fila">
                <button type="button" className="boton boton--peligro" onClick={retirar} disabled={ocupado}>
                  {textos.comun.si}
                </button>
                <button type="button" className="boton boton--secundario" onClick={() => setConfirmandoRetiro(false)}>
                  {textos.comun.no}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="boton boton--secundario" onClick={() => setConfirmandoRetiro(true)}>
              {t.botonRetirar}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
