import {useEffect} from "react";
import {useTheme, QUOTES_LIGHT_ACCENT} from "../../contexts/theme-context";

/* A quotes szekció akcentusa EGY helyen. A szabály:
     - VILÁGOS téma → tinta-kék (QUOTES_LIGHT_ACCENT), a globális kék helyett;
     - SÖTÉT téma → nincs override (null), tehát a globális (téma) akcentusra esik
       vissza — jelenleg a sárga (a szekció-specifikus sötét szín később jöhet).

   Minden quotes-nézet ezt hívja (lista, szerkesztő), így a szekció egységes. A nézetek
   KÖZTI navigációnál a régi nézet cleanupja (null) és az új nézet beállítása ugyanabban
   a React-commitban fut → batchelődik, tehát a globális kék nem villan fel köztük.
   Témaváltáskor (isLight változik) az effekt újrafut, és a helyes értéket állítja be.

   (A korábbi `showRed` ág — a szerző-szűrt nézet PIROS akcentusa — az E2EE-vel megszűnt
   a szerver-oldali szerző-szűréssel együtt; a piros hiba-akcentus külön mechanizmus.) */
export function useQuoteAccent(): void {
    const {setAccentOverride, isChecked: isLight} = useTheme();
    useEffect(() => {
        setAccentOverride(isLight ? QUOTES_LIGHT_ACCENT : null);
        return () => setAccentOverride(null);
    }, [isLight, setAccentOverride]);
}
