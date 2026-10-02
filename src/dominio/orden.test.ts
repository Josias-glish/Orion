import { describe, expect, it } from "vitest";
import { ordenarFilas } from "./orden";

interface Fila {
  id: string;
  nombre: string;
  valor: number | null;
}
const filas: Fila[] = [
  { id: "1", nombre: "Óscar", valor: 5 },
  { id: "2", nombre: "ana", valor: null },
  { id: "3", nombre: "Beto", valor: 1 },
  { id: "4", nombre: "Álvaro", valor: 5 },
];
const ids = (f: Fila[]) => f.map((x) => x.id);

describe("ordenarFilas", () => {
  it("ordena números de menor a mayor y al revés, con los vacíos siempre al final", () => {
    expect(ids(ordenarFilas(filas, (f) => f.valor, "asc"))).toEqual(["3", "1", "4", "2"]);
    expect(ids(ordenarFilas(filas, (f) => f.valor, "desc"))).toEqual(["1", "4", "3", "2"]);
  });

  it("los empates conservan el orden original", () => {
    expect(ids(ordenarFilas(filas, (f) => f.valor, "asc")).slice(1, 3)).toEqual(["1", "4"]);
  });

  it("ordena texto como en español: sin distinguir mayúsculas ni tildes", () => {
    expect(ids(ordenarFilas(filas, (f) => f.nombre, "asc"))).toEqual(["4", "2", "3", "1"]);
    expect(ids(ordenarFilas(filas, (f) => f.nombre, "desc"))).toEqual(["1", "3", "2", "4"]);
  });

  it("devuelve una copia y no toca la lista original", () => {
    const original = [...filas];
    const resultado = ordenarFilas(filas, (f) => f.valor, "asc");
    expect(resultado).not.toBe(filas);
    expect(filas).toEqual(original);
  });
});
