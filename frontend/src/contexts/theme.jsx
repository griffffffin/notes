import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {useCookies} from "react-cookie";

/* A témák ADATKÉNT, nem if/else-ként — új téma (pl. kategóriánként eltérő) így
   egy új bejegyzés ebben a táblában, nem újabb elágazás a kódban.
   - backgroundColor / color: Bootstrap-osztálynevek (bg-*, text-*, border-*)
   - pageBackground: a <html> tényleges háttérszíne (ezt az index.html
     boot-szkriptje is beállítja, még a stíluslapok előtt) */
export const THEMES = {
    dark: {backgroundColor: "black", pageBackground: "#000", color: "warning", colorHex: "#ffc107"},
    light: {backgroundColor: "white", pageBackground: "#fff", color: "primary", colorHex: "#0d6efd"},
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
        html.classList.toggle("bg-black", !isLight);
        // A html inline háttere az index.html boot-szkriptjéből jön; témaváltáskor
        // itt kell szinkronban tartani, különben a régi szín ragadna be.
        html.style.background = theme.pageBackground;
        setCookie("backgroundColor", theme.backgroundColor, {path: "/"});
    }, [isLight, theme, setCookie]);

    const value = useMemo(() => ({...theme, isChecked: isLight, handleCheckedChange}),
        [theme, isLight, handleCheckedChange]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
