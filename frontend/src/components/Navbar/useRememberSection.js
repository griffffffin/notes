import {useEffect} from "react";
import {rememberSection} from "./sections";

/* Megjegyzi, hogy a felhasználó ebben a szekcióban járt — a gyökér-átirányítás
   (routes.jsx) ide fog visszatérni. Minden lista-nézet ezt hívja: a to-do lista,
   az idézet-lista és a keresési találat is.

   A szűrt nézetek is a szekció GYÖKERÉT jegyzik meg (pl. /quotes, nem
   /quotes/Márai): visszatéréskor a teljes lista a helyes kiindulás, nem az a
   szűrő, amiben a felhasználó legutóbb elidőzött.

   A mountoláskor egyszer fut (üres deps), és szándékosan nem figyeli a path
   változását: a szekción belüli navigáció úgyis új mountot hoz. */
export function useRememberSection(path) {
    useEffect(() => {
        rememberSection(path);
    }, [path]);
}
