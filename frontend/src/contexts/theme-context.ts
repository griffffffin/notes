import {createContext, useContext} from "react";

/* A téma megosztható, NEM komponens részei: a téma-adatok (THEMES), a context és
   a useTheme hook. Külön fájlban a ThemeProvider komponenstől, hogy a theme.tsx
   csak komponenst exportáljon — így a Vite fast-refresh (HMR) megbízhatóan
   frissít (react/only-export-components). */

/* A témák ADATKÉNT, saját (hex) színekkel — nem a Bootstrap-paletta nevei.
   A Provider CSS-változókként (--theme-*) teszi ki őket a <html>-re, a
   stílusokat az index.css .text-theme / .btn-theme / ... osztályai olvassák
   belőlük. Új téma (pl. szekciónként) = új bejegyzés ebben a táblában.
   A pageBackground-ot a "themeBackground" sütibe is kiírjuk: az index.html
   boot-szkriptje ezt olvassa, és még a stíluslapok előtt kifesti vele a lapot
   (fehér villanás ellen) — így nem kell a színt két helyen karbantartani.

   Az `as const` itt egy konkrét hibát is kizár: a `todoDefaultColor` így nem
   akármilyen szöveg, hanem a "warning" és a "primary" — vagyis a to-do paletta
   (todoColors.ts) VALÓDI nevei. Egy elgépelt szín némán hatástalan Bootstrap-
   osztályt adna ("border-warnign"), amit csak a kártya színe árulna el. */
export const THEMES = {
    dark: {
        cookieValue: "black",                   // a meglévő süti-értékek maradnak
        pageBackground: "#000",
        text: "#fff",                           // alap szövegszín az oldalon
        accent: "#ffca28",                      // kiemelőszín: logó, ikonok, gombok
        accentContrast: "#000",                 // szöveg a kiemelőszínű gombokon
        focusBorder: "#ffe289",                 // input fókusz-keret (az akcentus világos árnyalata)
        focusRing: "rgba(255, 202, 40, 0.45)",  // input fókusz-ragyogás (az akcentus 45%-on)
        todoDefaultColor: "warning",            // az új to-do kártya kezdőszíne (a kártya-paletta 6 nevéből)
    },
    light: {
        cookieValue: "white",
        pageBackground: "#fff",
        text: "#000",
        accent: "#0b5ed7",
        accentContrast: "#fff",
        focusBorder: "#91b7ed",
        focusRing: "rgba(11, 94, 215, 0.35)",
        todoDefaultColor: "primary",
    },
} as const;

/* A szekció-akcentus HÁROM színe mindig együtt jár: a kiemelőszín és a hozzá
   illő input-fókusz keret/ragyogás. Külön típus, mert a Provider state-je és a
   context függvénye is ezt az együttest kezeli — ha egy negyedik szín is kellene
   (pl. hover), itt bővül, és minden felhasználója együtt mozdul. */
export type AccentOverride = {
    accent: string;
    focusBorder: string;
    focusRing: string;
};

/* Szekció-akcentus felülírás (setAccentOverride, l. ThemeProvider): egy nézet a téma
   kiemelőszínét ideiglenesen MÁSSAL válthatja ki — így a --theme-accent-re épülő
   MINDEN elem (navbar, scrollbar, gombok, toggle-ragyogás, kártyák) együtt vált,
   mindkét témában. Az első ilyen a szerző-szűrt idézet-nézet PIROSA (a nap-ikon
   színe); a név ÁLTALÁNOS, mert más szekciók/nézetek is kaphatnak sajátot. A focus-*
   a piroshoz igazított input-fókusz-keret/-ragyogás. */
export const ACCENT_RED: AccentOverride = {
    accent: "#db1937",
    focusBorder: "#f1a7b3",
    focusRing: "rgba(219, 25, 55, 0.4)",
};

/* A quotes szekció VILÁGOS témájú akcentusa: tinta-kék, a globális világos kék
   (#0b5ed7) helyett. SÖTÉT témán a szekció a globális (sárga) akcentust használja —
   ezért ez CSAK a világos érték; a sötétnél a szekció-override null (l. useQuoteAccent).
   Ez a szekciónkénti világos/sötét színrendszer első példánya (később más szekciók is
   kaphatnak sajátot). A focus-* a tintához igazított input-fókusz-keret/-ragyogás. */
export const QUOTES_LIGHT_ACCENT: AccentOverride = {
    accent: "#284ec0",
    focusBorder: "#9eafe3",
    focusRing: "rgba(40, 78, 192, 0.35)",
};

/* Amit a context ad. A `color: "theme"` szándékosan a KONKRÉT szó, nem akármilyen
   string: a komponensek Bootstrap-stílusban fűzik hozzá ("text-" + color), és az
   index.css-ben pontosan a .text-theme / .btn-theme osztályok léteznek. */
export type Theme = {
    color: "theme";
    colorHex: string;
    pageBackground: string;
    todoDefaultColor: string;
    isChecked: boolean;
    handleCheckedChange: () => void;
    setAccentOverride: (override: AccentOverride | null) => void;
};

export const ThemeContext = createContext<Theme | null>(null);

export function useTheme(): Theme {
    const theme = useContext(ThemeContext);
    if (!theme) throw new Error("useTheme csak <ThemeProvider> alatt használható.");
    return theme;
}
