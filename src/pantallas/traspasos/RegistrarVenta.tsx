import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Campo, Casilla } from "../../componentes/Campo";
import { useConexion, useContextoCambio, useNavegar } from "../../componentes/contextos";
import { ListaMotivos } from "../../componentes/ListaMotivos";
import { useCarga } from "../../componentes/useCarga";
import { obtenerAnimal } from "../../datos/repositorios/animales";
import { listarContactos } from "../../datos/repositorios/contactos";
import { registrarVenta, type ResultadoTraspaso } from "../../datos/repositorios/traspasos";
import { fechaLocal } from "../../dominio/fechas";
import { leerPesos } from "../../dominio/finanzas";
import { textos } from "../../textos/es";
import { FormularioContacto } from "../animales/FormularioContacto";

const t = textos.traspasos.venta;

/**
 * RF-16 (R20): registrar la venta de un animal del hato. Queda como vendido (sale del ordeño, de los servicios y del
 * inventario) y conserva su historial, su genealogía y su registro propio. Solo el propietario (R23): la ruta exige
 * `gestionar_traspasos`.
 */
export function RegistrarVenta({ animalId }: { animalId: string }) {
  const conexion = useConexion();
  const contexto = useContextoCambio();
  const navegar = useNavegar();
  const { datos: carga, error: errorCarga } = useCarga(
    async () => ({ animal: await obtenerAnimal(conexion, animalId), contactos: await listarContactos(conexion) }),
    [conexion, animalId],
  );

  const [contactos, setContactos] = useState<NonNullable<typeof carga>["contactos"] | null>(null);
  const [agregandoContacto, setAgregandoContacto] = useState(false);
  const [compradorId, setCompradorId] = useState("");
  const [fecha, setFecha] = useState(fechaLocal());
  const [precio, setPrecio] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [crearIngreso, setCrearIngreso] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoTraspaso | null>(null);

  if (errorCarga) return <ListaMotivos error={errorCarga} />;
  if (!carga) return <p>{textos.comun.cargando}</p>;
  const { animal } = carga;
  if (!animal) return <p className="aviso aviso--error">{textos.ficha.noExiste}</p>;

  const nombre = animal.nombre ?? animal.identificadores.find((i) => i.principal)?.valor ?? textos.animales.sinNombre;
  const listaContactos = contactos ?? carga.contactos;
  const etiquetaContacto = (c: { nombre: string; criadero: string | null }) => (c.criadero ? `${c.nombre} · ${c.criadero}` : c.nombre);
  const comprador = listaContactos.find((c) => c.id === compradorId) ?? null;
  const precioLeido = precio.trim() === "" ? null : (leerPesos(precio) ?? Number.NaN);
  const hayPrecio = precioLeido !== null && Number.isSafeInteger(precioLeido) && precioLeido > 0;
  const disponible = animal.enHato && animal.origen !== "externo" && animal.estado === "activo";

  async function guardar() {
    setError(null);
    setGuardando(true);
    try {
      const hecho = await registrarVenta(
        conexion,
        {
          animalId,
          compradorId: compradorId || null,
          fecha,
          precio: precioLeido,
          observaciones: observaciones.trim() || null,
          crearIngreso: crearIngreso && hayPrecio,
          descripcionMovimiento: textos.traspasos.descripcionIngreso(nombre, comprador ? comprador.nombre : ""),
        },
        contexto(),
      );
      setResultado(hecho);
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  }

  if (resultado) {
    return (
      <section className="pantalla pantalla--ancha" data-prueba="venta-registrada">
        <h1>{t.titulo(nombre)}</h1>
        <Aviso tipo="exito">
          <span data-prueba="venta-listo">{t.listo(nombre)}</span>
          {resultado.movimientoId && <span> {textos.traspasos.movimientoAnotado(textos.traspasos.ingreso, textos.comun.pesos(precioLeido ?? 0))}</span>}
        </Aviso>
        <div className="tarjeta">
          <h2>{t.entregarTitulo}</h2>
          <p>{t.entregarAyuda}</p>
          <div className="acciones">
            <button type="button" className="boton" onClick={() => navegar({ pantalla: "documentos", seccion: "hojaVenta", animalId })} data-prueba="venta-ir-hoja">
              {t.entregar}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "animal", id: animalId, pestana: "ficha" })} data-prueba="venta-ver-ficha">
              {t.irAFicha}
            </button>
            <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "traspasos" })} data-prueba="venta-ver-historial">
              {textos.traspasos.elHistorial}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="pantalla pantalla--ancha" data-prueba="pantalla-venta">
      <button type="button" className="enlace" onClick={() => navegar({ pantalla: "animal", id: animalId, pestana: "ficha" })}>
        {textos.traspasos.verAnimal}
      </button>
      <h1>{t.titulo(nombre)}</h1>
      {!disponible ? (
        <Aviso tipo="error">{t.noDisponible}</Aviso>
      ) : (
        <>
          <p className="nota">{t.ayuda}</p>
          <ListaMotivos error={error} />
          <form
            className="tarjeta"
            onSubmit={(e) => {
              e.preventDefault();
              guardar();
            }}
          >
            {agregandoContacto ? (
              <FormularioContacto
                alGuardar={async (id) => {
                  setContactos(await listarContactos(conexion));
                  setCompradorId(id);
                  setAgregandoContacto(false);
                }}
                alCancelar={() => setAgregandoContacto(false)}
              />
            ) : (
              <div className="rejilla">
                <Campo etiqueta={t.comprador} ayuda={t.compradorAyuda}>
                  <select value={compradorId} onChange={(e) => setCompradorId(e.target.value)} data-prueba="venta-comprador">
                    <option value="">{t.elegirComprador}</option>
                    {listaContactos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {etiquetaContacto(c)}
                      </option>
                    ))}
                  </select>
                </Campo>
                <div className="campo">
                  <span className="campo__etiqueta">&nbsp;</span>
                  <button type="button" className="boton boton--secundario" onClick={() => setAgregandoContacto(true)} data-prueba="venta-agregar-comprador">
                    {t.agregarComprador}
                  </button>
                </div>
              </div>
            )}
            <div className="rejilla">
              <Campo etiqueta={t.fecha} ancho="corto">
                <input type="date" value={fecha} max={fechaLocal()} onChange={(e) => setFecha(e.target.value)} data-prueba="venta-fecha" />
              </Campo>
              <Campo etiqueta={t.precio} ayuda={t.precioAyuda} ancho="corto">
                <input inputMode="numeric" autoComplete="off" value={precio} onChange={(e) => setPrecio(e.target.value)} data-prueba="venta-precio" />
              </Campo>
              <Campo etiqueta={t.observaciones} ancho="largo">
                <textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} data-prueba="venta-observaciones" />
              </Campo>
            </div>
            {hayPrecio && (
              <div>
                <Casilla etiqueta={t.crearIngreso} marcada={crearIngreso} alCambiar={setCrearIngreso} prueba="venta-crear-ingreso" />
                <p className="nota">{t.crearIngresoAyuda}</p>
              </div>
            )}
            <div className="acciones">
              <button type="button" className="boton boton--secundario" onClick={() => navegar({ pantalla: "animal", id: animalId, pestana: "ficha" })}>
                {textos.comun.cancelar}
              </button>
              <button type="submit" className="boton" disabled={guardando} data-prueba="guardar-venta">
                {guardando ? t.guardando : t.guardar}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
