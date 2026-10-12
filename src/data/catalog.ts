import type { Poem } from "../types";

let catalogPromise: Promise<Poem[]> | undefined;

export function loadPoemCatalog(): Promise<Poem[]> {
  catalogPromise ??= import("./poems").then(({ POEMS }) => POEMS);
  return catalogPromise;
}
