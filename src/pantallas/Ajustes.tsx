import { useEffect, useState } from "react";
import { rutaBaseDatos } from "../datos/ubicacion";
import { textos } from "../textos/es";

export function Ajustes() {
  const [ruta, setRuta] = useState<string | null>(null);

  useEffect(() => {
    rutaBaseDatos().then(setRuta);
  }, []);

  const t = textos.ajustes;
  return (
    <section className="pantalla">
      <h1>{t.titulo}</h1>
      <p>{t.descripcion}</p>
      <h2>{t.baseDatos}</h2>
      <p className="ruta">{ruta ?? textos.comun.cargando}</p>
      {import.meta.env.DEV && <p className="nota">{t.modoDesarrollo}</p>}
    </section>
  );
}
