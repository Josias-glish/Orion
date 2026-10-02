import { useState } from "react";
import { Campo } from "../../componentes/Campo";
import { useConexion, useNavegar, usePermiso } from "../../componentes/contextos";
import { useCarga } from "../../componentes/useCarga";
import { listarExternos } from "../../datos/repositorios/animales";
import { formatearFecha } from "../../dominio/fechas";
import { SEXOS, type Sexo } from "../../dominio/tipos";
import { textos } from "../../textos/es";

/**
 * R29 (RF-47): animales de otras fincas, por ejemplo los sementales con que se sirven las hembras. Solo sirven para la
 * genealogía: no cuentan en el inventario, el ordeño, los servicios propios ni las alertas.
 */
export function ListaExternos() {
  const conexion = useConexion();
  const navegar = useNavegar();
  const puedeCrear = usePermiso("crear_animal");
  const [texto, setTexto] = useState("");
  const [sexo, setSexo] = useState<Sexo | null>(null);
  const { datos: animales } = useCarga(() => listarExternos(conexion, { texto, sexo }), [conexion, texto, sexo]);
  const t = textos.animales;

  return (
    <div>
      <p className="nota">{t.externosAyuda}</p>
      {puedeCrear && (
        <div className="acciones">
          <button
            type="button"
            className="boton"
            onClick={() => navegar({ pantalla: "nuevoAnimal", externo: true })}
            data-prueba="registrar-externo"
          >
            {t.registrarExterno}
          </button>
        </div>
      )}
      <div className="filtros">
        <Campo etiqueta={t.buscar} ancho="largo">
          <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} data-prueba="buscar-externo" />
        </Campo>
        <Campo etiqueta={t.filtroSexo} ancho="corto">
          <select value={sexo ?? ""} onChange={(e) => setSexo((e.target.value || null) as Sexo | null)}>
            <option value="">{textos.comun.todos}</option>
            {SEXOS.map((s) => (
              <option key={s} value={s}>
                {textos.comun.sexo[s]}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      {animales === null ? (
        <p>{textos.comun.cargando}</p>
      ) : animales.length === 0 ? (
        <p className="nota">{texto || sexo ? t.vacio : t.externosVacio}</p>
      ) : (
        <table className="tabla tabla--filas" data-prueba="tabla-externos">
          <thead>
            <tr>
              <th>{t.columnas.identificador}</th>
              <th>{t.columnas.nombre}</th>
              <th>{t.columnas.sexo}</th>
              <th>{t.columnas.nacimiento}</th>
              <th>{t.columnas.propietario}</th>
              <th>{t.columnas.estado}</th>
            </tr>
          </thead>
          <tbody>
            {animales.map((a) => (
              <tr key={a.id} onClick={() => navegar({ pantalla: "animal", id: a.id, pestana: "ficha" })}>
                <td>{a.identificador ?? textos.comun.sinDato}</td>
                <td>
                  <button
                    type="button"
                    className="enlace"
                    onClick={(e) => {
                      e.stopPropagation();
                      navegar({ pantalla: "animal", id: a.id, pestana: "ficha" });
                    }}
                  >
                    {a.nombre ?? t.sinNombre}
                  </button>
                </td>
                <td>{textos.comun.sexo[a.sexo]}</td>
                <td>{a.fechaNacimiento ? formatearFecha(a.fechaNacimiento) : textos.comun.sinDato}</td>
                <td>{a.propietario ?? <span className="nota">{t.sinPropietario}</span>}</td>
                <td>{textos.comun.estado[a.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
