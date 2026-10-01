import { useEffect, useState } from "react";
import { useConexion } from "../componentes/ConexionContexto";
import { consultarEstado, type EstadoBaseDatos } from "../datos/diagnostico";
import { textos } from "../textos/es";

export function Inicio() {
  const conexion = useConexion();
  const [estado, setEstado] = useState<EstadoBaseDatos | null>(null);

  useEffect(() => {
    consultarEstado(conexion).then(setEstado);
  }, [conexion]);

  const t = textos.inicio;
  return (
    <section className="pantalla">
      <h1>{t.titulo}</h1>
      <p className="destacado">{t.bienvenida}</p>
      <p>{t.descripcion}</p>
      <p className="nota">{t.etapa}</p>

      <h2>{t.resumenTitulo}</h2>
      {estado ? (
        <dl className="cifras">
          <div>
            <dt>{t.animales}</dt>
            <dd data-prueba="total-animales">{estado.animales}</dd>
          </div>
          <div>
            <dt>{t.razas}</dt>
            <dd>{estado.razas}</dd>
          </div>
          <div>
            <dt>{t.libros}</dt>
            <dd>{estado.libros}</dd>
          </div>
        </dl>
      ) : (
        <p>{textos.comun.cargando}</p>
      )}
      <p className="nota">{t.proximamente}</p>
    </section>
  );
}
