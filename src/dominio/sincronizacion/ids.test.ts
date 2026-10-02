import { describe, expect, it } from "vitest";
import { esUuidV4 } from "../identidad";
import { idDeterminista, sha256Hex } from "./ids";

describe("identificadores calculados", () => {
  it("las mismas partes dan el mismo UUID y partes distintas dan otro", () => {
    const a = idDeterminista("finca", "animal", "x");
    expect(a).toBe(idDeterminista("finca", "animal", "x"));
    expect(esUuidV4(a)).toBe(true);
    expect(idDeterminista("finca", "animal", "y")).not.toBe(a);
    // «ab|c» y «a|bc» no se confunden.
    expect(idDeterminista("ab", "c")).not.toBe(idDeterminista("a", "bc"));
  });
  it("sha256Hex es el SHA-256 estándar", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});
