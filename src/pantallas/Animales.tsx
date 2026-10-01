import { useEffect, useState } from "react";
import { useConexion } from "../componentes/ConexionContexto";
import { listarAnimales, type AnimalResumen } from "../datos/repositorios/animales";
import { formatearFecha } from "../dominio/fechas";
import { textos } from "../textos/es";

export function Animales() {
  const conexion = useConexion();
  const [animales, setAnimales] = useState<AnimalResumen[] | null>(null);

  useEffect(() => {
    listarAnimales(conexion).then(setAnimales);
  }, [conexion]);

  const t = textos.animales;
  return (
    <section className="pantalla">
      <h1>{t.titulo}</h1>
      <p>{t.descripcion}</p>
      {animales === null && <p>{textos.comun.cargando}</p>}
      {animales?.length === 0 && <p className="nota">{t.vacio}</p>}
      {animales && animales.length > 0 && (
        <table className="tabla">
          <thead>
            <tr>
              <th>{t.columnas.nombre}</th>
              <th>{t.columnas.sexo}</th>
              <th>{t.columnas.nacimiento}</th>
              <th>{t.columnas.identificador}</th>
              <th>{t.columnas.estado}</th>
            </tr>
          </thead>
          <tbody>
            {animales.map((a) => (
              <tr key={a.id}>
                <td>{a.nombre ?? t.sinNombre}</td>
                <td>{textos.comun.sexo[a.sexo]}</td>
                <td>{a.fechaNacimiento ? formatearFecha(a.fechaNacimiento) : textos.comun.sinDato}</td>
                <td>
                  {a.tipoIdentificador && a.identificador
                    ? `${textos.comun.tipoIdentificador[a.tipoIdentificador]} ${a.identificador}`
                    : textos.comun.sinDato}
                </td>
                <td>{textos.comun.estado[a.estado]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
