import { useState } from "react";
import { useConexion, useContextoCambio, useNavegar, usePermiso, type PestanaAnimal } from "../../componentes/contextos";
import { listarAlertasRetiro } from "../../datos/repositorios/salud";
import { ListaEmitidos } from "../documentos/Documentos";
import { TablaPesajesAnimal } from "../pesos/Pesos";
import { TablaEventos } from "../salud/Salud";
import { ReproduccionAnimal } from "./ReproduccionAnimal";
import { Aviso } from "../../componentes/Aviso";
import { FotoAnimal } from "../../componentes/FotoAnimal";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { Pestanas } from "../../componentes/Pestanas";
import { RegistroAnimal } from "../registros/RegistroAnimal";
import { useCarga } from "../../componentes/useCarga";
import { eliminarAnimal, obtenerAnimal, type Animal, type Pariente } from "../../datos/repositorios/animales";
import { consultarHijos } from "../../datos/repositorios/genealogia";
import { traspasosDeAnimal } from "../../datos/repositorios/traspasos";
import { edadEnMeses, fechaLocal, formatearFecha } from "../../dominio/fechas";
import { textos } from "../../textos/es";
import { Genealogia } from "./Genealogia";
import { HistorialAnimal } from "./HistorialAnimal";
import { ServiciosMacho } from "./ServiciosMacho";

export const nombreVisible = (a: Pick<Animal, "nombre" | "identificadores">) =>
  a.nombre ?? a.identificadores.find((i) => i.principal)?.valor ?? textos.animales.sinNombre;

export function FichaAnimal({ id, pestana }: { id: string; pestana: PestanaAnimal }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const { datos: animal, error } = useCarga(() => obtenerAnimal(conexion, id), [conexion, id]);
  const hoy = fechaLocal();
  // RF-24: alertas de retiro vigentes de este animal, visibles en todas las pestañas de la ficha.
  const { datos: alertas } = useCarga(async () => (await listarAlertasRetiro(conexion, hoy)).filter((a) => a.animalId === id), [conexion, hoy, id]);
  const t = textos.ficha;
  const puedeVerRegistros = usePermiso("ver_registros");

  if (error) return <ListaMotivos error={error} />;
  if (animal === null) return <p>{textos.comun.cargando}</p>;
  if (!animal) return <p className="aviso aviso--error">{t.noExiste}</p>;

  return (
    <section className="pantalla pantalla--ancha">
      <button
        type="button"
        className="enlace"
        onClick={() => navegar({ pantalla: "animales", vista: animal.enHato ? "hato" : "externos" })}
      >
        {animal.enHato ? t.volver : t.volverExternos}
      </button>
      <div className="encabezado">
        <h1 data-prueba="titulo-animal">
          {nombreVisible(animal)}
          {animal.identificadores.find((i) => i.principal) && animal.nombre && (
            <span className="subtitulo"> · {animal.identificadores.find((i) => i.principal)!.valor}</span>
          )}
        </h1>
        <span className={`insignia insignia--${animal.estado}`}>{textos.comun.estado[animal.estado]}</span>
        {!animal.enHato && (
          <span className="insignia" data-prueba="insignia-origen">
            {animal.origen === "externo" ? textos.animales.deOtraFinca : textos.animales.soloGenealogia}
          </span>
        )}
      </div>
      {alertas && alertas.length > 0 && (
        <div className="alerta-ficha" data-prueba="alerta-retiro-ficha">
          <Aviso tipo="error">
            <p className="destacado">⚠ {textos.salud.alertaFicha}</p>
            <ul>
              {alertas.map((a) => (
                <li key={`${a.eventoId}-${a.tipo}`}>
                  {textos.salud.retiroHasta(textos.comun.tipoRetiro[a.tipo], formatearFecha(a.hasta))} ({a.producto})
                </li>
              ))}
            </ul>
          </Aviso>
        </div>
      )}
      <Pestanas
        opciones={[
          { valor: "ficha", texto: t.pestanas.ficha },
          { valor: "genealogia", texto: t.pestanas.genealogia },
          // R29: un animal de otra finca no tiene reproducción, pesos, salud ni documentos en esta finca.
          ...(animal.sexo === "hembra" && animal.enHato ? [{ valor: "reproduccion" as const, texto: t.pestanas.reproduccion }] : []),
          ...(animal.sexo === "macho" ? [{ valor: "servicios" as const, texto: t.pestanas.servicios }] : []),
          ...(animal.enHato
            ? [
                { valor: "pesos" as const, texto: t.pestanas.pesos },
                { valor: "salud" as const, texto: t.pestanas.salud },
                { valor: "documentos" as const, texto: t.pestanas.documentos },
              ]
            : []),
          // R31: el registro genealógico propio es del hato y solo lo ve el propietario (R23).
          ...(animal.enHato && animal.origen !== "externo" && puedeVerRegistros ? [{ valor: "registro" as const, texto: t.pestanas.registro }] : []),
          { valor: "historial", texto: t.pestanas.historial },
        ]}
        actual={pestana}
        alElegir={(p) => navegar({ pantalla: "animal", id, pestana: p })}
      />
      {pestana === "ficha" && <DatosFicha animal={animal} />}
      {pestana === "genealogia" && <Genealogia animalId={id} />}
      {pestana === "reproduccion" && animal.sexo === "hembra" && <ReproduccionAnimal animal={animal} />}
      {pestana === "servicios" && animal.sexo === "macho" && <ServiciosMacho machoId={id} />}
      {pestana === "pesos" && <PesosAnimal animalId={id} />}
      {pestana === "salud" && <SaludAnimal animalId={id} disponible={animal.estado === "activo" && animal.enHato} />}
      {pestana === "documentos" && <DocumentosAnimal animalId={id} />}
      {pestana === "registro" && puedeVerRegistros && <RegistroAnimal animalId={id} />}
      {pestana === "historial" && <HistorialAnimal animalId={id} />}
    </section>
  );
}

function PesosAnimal({ animalId }: { animalId: string }) {
  const navegar = useNavegar();
  const puedeRegistrar = usePermiso("registrar_peso");
  return (
    <div>
      {puedeRegistrar && (
        <div className="acciones">
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "pesos", seccion: "registrar", animalId })} data-prueba="registrar-pesaje">
            {textos.pesos.registrarEnFicha}
          </button>
        </div>
      )}
      <TablaPesajesAnimal animalId={animalId} />
    </div>
  );
}

function SaludAnimal({ animalId, disponible }: { animalId: string; disponible: boolean }) {
  const navegar = useNavegar();
  const puedeRegistrar = usePermiso("registrar_tratamiento");
  return (
    <div>
      {puedeRegistrar && disponible && (
        <div className="acciones">
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "salud", seccion: "registrar", animalId })} data-prueba="registrar-salud">
            {textos.salud.registrarEnFicha}
          </button>
        </div>
      )}
      <TablaEventos filtro={{ animalId }} />
    </div>
  );
}

function DocumentosAnimal({ animalId }: { animalId: string }) {
  const navegar = useNavegar();
  const puedeEmitir = usePermiso("emitir_documento");
  const d = textos.documentos;
  return (
    <div>
      {puedeEmitir && (
        <div className="acciones">
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "documentos", seccion: "certificado", animalId })} data-prueba="ir-certificado">
            {d.secciones.certificado}
          </button>
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "documentos", seccion: "expediente", animalId })} data-prueba="ir-expediente">
            {d.secciones.expediente}
          </button>
          <button type="button" className="boton" onClick={() => navegar({ pantalla: "documentos", seccion: "hojaVenta", animalId })} data-prueba="ir-hoja-venta">
            {d.secciones.hojaVenta}
          </button>
        </div>
      )}
      <ListaEmitidos animalId={animalId} />
    </div>
  );
}

/** RF-50 y RF-16: la compra y la venta de este animal, en su ficha (solo el propietario, R23). */
function TraspasosDeAnimal({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const { datos } = useCarga(() => traspasosDeAnimal(conexion, animalId), [conexion, animalId]);
  const t = textos.traspasos;
  if (!datos || datos.length === 0) return null;
  return (
    <div data-prueba="traspasos-animal">
      <h2>{t.enLaFicha}</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>{t.columnas.fecha}</th>
            <th>{t.columnas.tipo}</th>
            <th>{t.columnas.contacto}</th>
            <th className="numero">{t.columnas.precio}</th>
          </tr>
        </thead>
        <tbody>
          {datos.map((f) => (
            <tr key={f.id}>
              <td>{formatearFecha(f.fecha)}</td>
              <td>{t.tipo[f.tipo]}</td>
              <td>{f.contacto}</td>
              <td className="numero">{f.precio === null ? <span className="nota">{t.sinPrecio}</span> : textos.comun.pesos(f.precio)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnlacePariente({ pariente, sinVerificar }: { pariente: Pariente | null; sinVerificar: boolean }) {
  const navegar = useNavegar();
  if (!pariente) return <>{textos.comun.sinDato}</>;
  return (
    <>
      <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: pariente.id, pestana: "ficha" })}>
        {pariente.nombre ?? pariente.identificador ?? textos.animales.sinNombre}
        {pariente.nombre && pariente.identificador ? ` (${pariente.identificador})` : ""}
      </button>
      {sinVerificar && <span className="insignia insignia--aviso">{textos.ficha.sinVerificar}</span>}
    </>
  );
}

function DatosFicha({ animal }: { animal: Animal }) {
  const conexion = useConexion();
  const navegar = useNavegar();
  const contexto = useContextoCambio();
  const puedeEditar = usePermiso("editar_animal");
  // R23: compras y ventas solo para el propietario; la hoja de venta es un documento (`emitir_documento`).
  const puedeTraspasar = usePermiso("gestionar_traspasos");
  const puedeVerTraspasos = usePermiso("ver_traspasos");
  const puedeEmitir = usePermiso("emitir_documento");
  // R28 (SUPOSICION): el teléfono y el correo del propietario solo los ve quien puede ver los contactos.
  const verContactos = usePermiso("ver_contactos");
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const { datos: hijos } = useCarga(() => consultarHijos(conexion, animal.id), [conexion, animal.id]);
  const t = textos.ficha;
  const c = t.campos;
  const hoy = fechaLocal();
  const cantidadHijos = hijos ? hijos.comoPadre.length + hijos.comoMadre.length : 0;

  async function retirar() {
    try {
      await eliminarAnimal(conexion, animal.id, contexto());
      navegar({ pantalla: "animales", vista: animal.enHato ? "hato" : "externos" });
    } catch (e) {
      setError(e);
    }
  }

  return (
    <div>
      <ListaMotivos error={error} />
      {(puedeEditar || puedeTraspasar || puedeEmitir) && (
        <div className="acciones">
          {puedeEditar && (
            <button type="button" className="boton" onClick={() => navegar({ pantalla: "editarAnimal", id: animal.id })} data-prueba="editar">
              {textos.comun.editar}
            </button>
          )}
          {/* R20: se vende un animal del hato que sigue activo; R32: se compra uno de otra finca. */}
          {puedeTraspasar && animal.enHato && animal.origen !== "externo" && animal.estado === "activo" && (
            <button type="button" className="boton" onClick={() => navegar({ pantalla: "registrarVenta", animalId: animal.id })} data-prueba="registrar-venta">
              {t.registrarVenta}
            </button>
          )}
          {puedeTraspasar && !animal.enHato && animal.estado === "activo" && (
            <button type="button" className="boton" onClick={() => navegar({ pantalla: "registrarCompra", animalId: animal.id })} data-prueba="comprar-animal">
              {textos.animales.comprar}
            </button>
          )}
          {puedeEmitir && animal.enHato && (
            <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "documentos", seccion: "hojaVenta", animalId: animal.id })} data-prueba="hoja-de-venta">
              {t.hojaDeVenta}
            </button>
          )}
        </div>
      )}
      <div className="ficha-con-foto">
        <FotoAnimal ruta={animal.foto} alt={nombreVisible(animal)} />
        <dl className="ficha">
          <dt>{c.sexo}</dt>
          <dd>{textos.comun.sexo[animal.sexo]}</dd>
          <dt>{c.nacimiento}</dt>
          <dd>
            {animal.fechaNacimiento
              ? `${formatearFecha(animal.fechaNacimiento)} (${textos.comun.edad(edadEnMeses(animal.fechaNacimiento, hoy))})`
              : textos.comun.sinDato}
          </dd>
          <dt>{c.colorSenas}</dt>
          <dd>{animal.colorSenas ?? textos.comun.sinDato}</dd>
          <dt>{c.estado}</dt>
          <dd>{textos.comun.estado[animal.estado]}</dd>
          <dt>{c.origen}</dt>
          <dd data-prueba="origen">{animal.enHato || animal.origen === "externo" ? textos.comun.origen[animal.origen] : textos.animales.soloGenealogia}</dd>
          {animal.fechaIngreso && (
            <>
              <dt>{c.fechaIngreso}</dt>
              <dd data-prueba="fecha-ingreso">{formatearFecha(animal.fechaIngreso)}</dd>
            </>
          )}
          {/* R23: quién vendió el animal es parte de la compra; el operario no la ve. */}
          {animal.propietario && (animal.origen !== "comprado" || puedeVerTraspasos) && (
            <>
              <dt>{animal.origen === "comprado" ? c.vendedor : c.propietario}</dt>
              <dd data-prueba="propietario">
                {[
                  animal.propietario.nombre,
                  animal.propietario.criadero,
                  animal.propietario.municipio,
                  ...(verContactos ? [animal.propietario.telefono, animal.propietario.correo] : []),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </>
          )}
          <dt>{c.padre}</dt>
          <dd data-prueba="padre">
            <EnlacePariente pariente={animal.padre} sinVerificar={animal.padreSinVerificar} />
          </dd>
          <dt>{c.madre}</dt>
          <dd data-prueba="madre">
            <EnlacePariente pariente={animal.madre} sinVerificar={animal.madreSinVerificar} />
          </dd>
          <dt>{c.libro}</dt>
          <dd>{animal.libro ?? textos.comun.sinDato}</dd>
          <dt>{c.formaConcepcion}</dt>
          <dd>{animal.formaConcepcion ? textos.comun.formaConcepcion[animal.formaConcepcion] : textos.comun.sinDato}</dd>
          {animal.enHato && (
            <>
              <dt>{c.lote}</dt>
              <dd>{animal.lote ?? textos.comun.sinDato}</dd>
            </>
          )}
          <dt>{t.razaTitulo}</dt>
          <dd data-prueba="composicion">
            {animal.composicion.length === 0
              ? t.sinComposicion
              : animal.composicion.map((f) => `${textos.comun.porcentaje(f.fraccion * 100)} ${f.raza}`).join(", ")}
          </dd>
          <dt>{c.observaciones}</dt>
          <dd>{animal.observaciones ?? textos.comun.sinDato}</dd>
        </dl>
      </div>

      {puedeVerTraspasos && <TraspasosDeAnimal animalId={animal.id} />}

      <h2>{t.identificadoresTitulo}</h2>
      {animal.identificadores.length === 0 ? (
        <p className="nota">{t.sinIdentificadores}</p>
      ) : (
        <table className="tabla">
          <thead>
            <tr>
              <th>{t.columnasIdentificador.tipo}</th>
              <th>{t.columnasIdentificador.valor}</th>
              <th>{t.columnasIdentificador.fecha}</th>
              <th>{t.columnasIdentificador.vigente}</th>
              <th>{t.columnasIdentificador.principal}</th>
            </tr>
          </thead>
          <tbody>
            {animal.identificadores.map((i) => (
              <tr key={i.id}>
                <td>{textos.comun.tipoIdentificador[i.tipo]}</td>
                <td>{i.valor}</td>
                <td>{i.fecha ? formatearFecha(i.fecha) : textos.comun.sinDato}</td>
                <td>{i.vigente ? textos.comun.si : textos.comun.no}</td>
                <td>{i.principal ? textos.comun.si : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {puedeEditar && (
        <div className="tarjeta tarjeta--peligro">
          <h2>{t.retirarTitulo}</h2>
          <p>{t.retirarExplicacion}</p>
          {cantidadHijos > 0 && <p className="destacado">{t.retirarConHijos(cantidadHijos)}</p>}
          {confirmando ? (
            <div className="acciones">
              <span className="destacado">{t.retirarConfirmar}</span>
              <button type="button" className="boton boton--peligro" onClick={retirar}>
                {textos.comun.confirmar}
              </button>
              <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(false)}>
                {textos.comun.cancelar}
              </button>
            </div>
          ) : (
            <button type="button" className="boton boton--secundario" onClick={() => setConfirmando(true)}>
              {t.retirarTitulo}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
