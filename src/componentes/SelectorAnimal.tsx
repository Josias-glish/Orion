import { useMemo, useState } from "react";
import type { AnimalResumen } from "../datos/repositorios/animales";
import { textos } from "../textos/es";

interface Props {
  etiqueta: string;
  candidatos: readonly AnimalResumen[];
  valor: string | null;
  alCambiar: (id: string | null) => void;
  prueba?: string;
}

export const nombreDeAnimal = (a: Pick<AnimalResumen, "nombre" | "identificador">) =>
  [a.nombre ?? textos.animales.sinNombre, a.identificador ? `(${a.identificador})` : ""].join(" ").trim();

/** Elegir un animal escribiendo parte de su nombre o identificador (cómodo con cientos de animales). */
export function SelectorAnimal({ etiqueta, candidatos, valor, alCambiar, prueba }: Props) {
  const [texto, setTexto] = useState("");
  const elegido = candidatos.find((c) => c.id === valor) ?? null;
  const resultados = useMemo(() => {
    const t = texto.trim().toLowerCase();
    if (!t) return [];
    return candidatos.filter((c) => nombreDeAnimal(c).toLowerCase().includes(t)).slice(0, 8);
  }, [texto, candidatos]);

  if (elegido) {
    return (
      <div className="campo campo--largo">
        <span className="campo__etiqueta">{etiqueta}</span>
        <div className="elegido">
          <span data-prueba={prueba && `${prueba}-elegido`}>{nombreDeAnimal(elegido)}</span>
          <button type="button" className="boton boton--secundario boton--pequeno" onClick={() => alCambiar(null)}>
            {textos.comun.quitar}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="campo campo--largo selector">
      <label className="campo__etiqueta" htmlFor={prueba}>
        {etiqueta}
      </label>
      <input
        id={prueba}
        type="search"
        value={texto}
        placeholder={textos.formulario.buscarAnimal}
        onChange={(e) => setTexto(e.target.value)}
        data-prueba={prueba}
        autoComplete="off"
      />
      {texto.trim() && (
        <ul className="selector__resultados">
          {resultados.length === 0 && <li className="nota">{textos.formulario.ningunResultado}</li>}
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  alCambiar(c.id);
                  setTexto("");
                }}
              >
                {nombreDeAnimal(c)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
