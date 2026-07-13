import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {useCookies} from "react-cookie";

/* A témák ADATKÉNT, saját (hex) színekkel — nem a Bootstrap-paletta nevei.
   A Provider CSS-változókként (--theme-*) teszi ki őket a <html>-re, a
   stílusokat az index.css .text-theme / .btn-theme / ... osztályai olvassák
   belőlük. Új téma (pl. kategóriánként) = új bejegyzés ebben a táblában.
   FIGYELEM: a pageBackground-ot az index.html boot-szkriptje is festi
   (#000/#fff, a cookie alapján, még a CSS előtt) — ha itt megváltozik,
   ott is át kell vezetni. */
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

const ThemeContext = createContext(null);

export function useTheme() {
    const theme = useContext(ThemeContext);
    if (!theme) throw new Error("useTheme csak <ThemeProvider> alatt használható.");
    return theme;
}

export function ThemeProvider({children}) {
    const [cookies, setCookie] = useCookies(["backgroundColor"]);
    // A kapcsoló bekapcsolva = világos téma. A kezdőérték a sütiből jön, hogy
    // ne kelljen egy fölösleges rendert várni rá.
    const [isLight, setIsLight] = useState(cookies.backgroundColor === "white");

    const theme = isLight ? THEMES.light : THEMES.dark;

    const handleCheckedChange = useCallback(() => setIsLight((light) => !light), []);

    useEffect(() => {
        const html = document.documentElement;
        // A html inline háttere az index.html boot-szkriptjéből jön; témaváltáskor
        // itt kell szinkronban tartani, különben a régi szín ragadna be.
        html.style.background = theme.pageBackground;
        html.style.setProperty("--theme-page-bg", theme.pageBackground);
        html.style.setProperty("--theme-text", theme.text);
        html.style.setProperty("--theme-accent", theme.accent);
        html.style.setProperty("--theme-accent-contrast", theme.accentContrast);
        html.style.setProperty("--theme-focus-border", theme.focusBorder);
        html.style.setProperty("--theme-focus-ring", theme.focusRing);
        setCookie("backgroundColor", theme.cookieValue, {path: "/"});
    }, [theme, setCookie]);

    const value = useMemo(() => ({
        // Bootstrap-stílusú osztálynév-végződés: a komponensek "text-" + color
        // formában fűzik — a "theme" végződéshez az index.css saját osztályai
        // tartoznak (.text-theme, .btn-theme, ...), CSS-változókból színezve.
        color: "theme",
        colorHex: theme.accent,
        pageBackground: theme.pageBackground,
        todoDefaultColor: theme.todoDefaultColor,
        isChecked: isLight,
        handleCheckedChange,
    }), [theme, isLight, handleCheckedChange]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
