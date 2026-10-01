import { useCallback, useEffect, useState } from "react";

/** Carga datos de forma asíncrona y permite volver a cargarlos después de un cambio. */
export function useCarga<T>(cargar: () => Promise<T>, dependencias: readonly unknown[]) {
  const [datos, setDatos] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const funcion = useCallback(cargar, dependencias);

  const recargar = useCallback(async () => {
    try {
      setDatos(await funcion());
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [funcion]);

  useEffect(() => {
    let vigente = true;
    funcion().then(
      (d) => vigente && (setDatos(d), setError(null)),
      (e: unknown) => vigente && setError(e),
    );
    return () => {
      vigente = false;
    };
  }, [funcion]);

  return { datos, error, recargar };
}
