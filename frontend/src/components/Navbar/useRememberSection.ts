import {useEffect} from "react";
import {rememberSection} from "./sections";
import type {SectionPath} from "./sections";

/* Megjegyzi, hogy a felhasználó ebben a szekcióban járt — a gyökér-átirányítás
   (routes.tsx) ide fog visszatérni. Minden lista-nézet ezt hívja: a to-do lista,
   az idézet-lista és a keresési találat is.

   A szűrt nézetek is a szekció GYÖKERÉT jegyzik meg (pl. /quotes, nem
   /quotes/Márai): visszatéréskor a teljes lista a helyes kiindulás, nem az a
   szűrő, amiben a felhasználó legutóbb elidőzött.

   A mountoláskor egyszer fut (üres deps), és szándékosan nem figyeli a path
   változását: a szekción belüli navigáció úgyis új mountot hoz.

   A `path` típusa `SectionPath`, nem `string`: csak LÉTEZŐ szekció gyökerét lehet
   megjegyezni. Enélkül egy elgépelt vagy szűrt út (mondjuk "/quotes/Márai")
   simán eltárolódna, a `lastSectionPath` viszont ismeretlenként elutasítaná — és
   az emlékezet NÉMÁN sosem működne arra a szekcióra. */
export function useRememberSection(path: SectionPath): void {
    useEffect(() => {
        rememberSection(path);
    }, [path]);
}
