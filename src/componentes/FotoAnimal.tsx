import { useEffect, useState } from "react";
import { direccionDeFoto } from "../datos/fotos";
import { textos } from "../textos/es";

/** Foto de un animal guardada en la carpeta de datos, o un recuadro vacío. */
export function FotoAnimal({ ruta, alt }: { ruta: string | null; alt: string }) {
  const [direccion, setDireccion] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    setDireccion(null);
    if (ruta) direccionDeFoto(ruta).then((d) => vigente && setDireccion(d));
    return () => {
      vigente = false;
    };
  }, [ruta]);
  return (
    <div className="foto">
      {direccion ? <img src={direccion} alt={alt} data-prueba="foto" /> : <span>{textos.formulario.sinFoto}</span>}
    </div>
  );
}
