interface Props<T extends string> {
  opciones: readonly { valor: T; texto: string }[];
  actual: T;
  alElegir: (valor: T) => void;
}

export function Pestanas<T extends string>({ opciones, actual, alElegir }: Props<T>) {
  return (
    <div className="pestanas" role="tablist">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="tab"
          aria-selected={actual === o.valor}
          className="pestanas__opcion"
          onClick={() => alElegir(o.valor)}
          data-pestana={o.valor}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}
