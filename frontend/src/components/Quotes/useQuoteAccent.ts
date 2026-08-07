import {useEffect} from "react";
import {useTheme, ACCENT_RED, QUOTES_LIGHT_ACCENT} from "../../contexts/theme-context";

/* A quotes szekció akcentusa EGY helyen. A szabály:
     - VILÁGOS téma → tinta-kék (QUOTES_LIGHT_ACCENT), a globális kék helyett;
     - SÖTÉT téma → nincs override (null), tehát a globális (téma) akcentusra esik
       vissza — jelenleg a sárga (a szekció-specifikus sötét szín később jöhet);
     - szerző-szűrt nézet találattal (showRed) → PIROS, mindkét témában, felülüti a fentit.

   Minden quotes-nézet ezt hívja (lista, szűrt, szerkesztő, publikus egy-idézet), így a
   szekció egységes. A nézetek KÖZTI navigációnál a régi nézet cleanupja (null) és az új
   nézet beállítása ugyanabban a React-commitban fut → batchelődik, tehát a globális kék
   nem villan fel köztük. Témaváltáskor (isLight változik) az effekt újrafut, és a helyes
   értéket állítja be. */
export function useQuoteAccent(showRed = false): void {
    const {setAccentOverride, isChecked: isLight} = useTheme();
    useEffect(() => {
        setAccentOverride(showRed ? ACCENT_RED : (isLight ? QUOTES_LIGHT_ACCENT : null));
        return () => setAccentOverride(null);
    }, [showRed, isLight, setAccentOverride]);
}
