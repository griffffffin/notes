import {createContext, useContext} from "react";

/* A téma megosztható, NEM komponens részei: a téma-adatok (THEMES), a context és
   a useTheme hook. Külön fájlban a ThemeProvider komponenstől, hogy a theme.jsx
   csak komponenst exportáljon — így a Vite fast-refresh (HMR) megbízhatóan
   frissít (react/only-export-components). */

/* A témák ADATKÉNT, saját (hex) színekkel — nem a Bootstrap-paletta nevei.
   A Provider CSS-változókként (--theme-*) teszi ki őket a <html>-re, a
   stílusokat az index.css .text-theme / .btn-theme / ... osztályai olvassák
   belőlük. Új téma (pl. kategóriánként) = új bejegyzés ebben a táblában.
   A pageBackground-ot a "themeBackground" sütibe is kiírjuk: az index.html
   boot-szkriptje ezt olvassa, és még a stíluslapok előtt kifesti vele a lapot
   (fehér villanás ellen) — így nem kell a színt két helyen karbantartani. */
export const THEMES = {
    dark: {
        cookieValue: "black",                   // a meglévő süti-értékek maradnak
        pageBackground: "#000",
        text: "#fff",                           // alap szövegszín az oldalon
        accent: "#ffc107",                      // kiemelőszín: logó, ikonok, gombok
        accentContrast: "#000",                 // szöveg a kiemelőszínű gombokon
        focusBorder: "#ffd6a6",                 // input fókusz-keret
        focusRing: "rgba(255, 193, 7, 0.45)",   // input fókusz-ragyogás
        todoDefaultColor: "warning",            // az új to-do kártya kezdőszíne (a kártya-paletta 6 nevéből)
    },
    light: {
        cookieValue: "white",
        pageBackground: "#fff",
        text: "#000",
        accent: "#0d6efd",
        accentContrast: "#fff",
        focusBorder: "#9ec5fe",
        focusRing: "rgba(13, 110, 253, 0.35)",
        todoDefaultColor: "primary",
    },
};

export const ThemeContext = createContext(null);

export function useTheme() {
    const theme = useContext(ThemeContext);
    if (!theme) throw new Error("useTheme csak <ThemeProvider> alatt használható.");
    return theme;
}
