import {createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState} from "react";
import {useCookies} from "react-cookie";

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

const ThemeContext = createContext(null);

export function useTheme() {
    const theme = useContext(ThemeContext);
    if (!theme) throw new Error("useTheme csak <ThemeProvider> alatt használható.");
    return theme;
}

export function ThemeProvider({children}) {
    const [cookies, setCookie] = useCookies(["backgroundColor", "themeBackground"]);
    // A kapcsoló bekapcsolva = világos téma. A kezdőérték a sütiből jön, hogy
    // ne kelljen egy fölösleges rendert várni rá.
    const [isLight, setIsLight] = useState(cookies.backgroundColor === "white");

    const theme = isLight ? THEMES.light : THEMES.dark;

    const handleCheckedChange = useCallback(() => setIsLight((light) => !light), []);

    /* useLayoutEffect és NEM useEffect: ez a különbség itt látható a képernyőn.

       A useEffect a FESTÉS UTÁN fut, tehát az első képkockán a --theme-* még
       nem létezne. Ilyenkor a rá hivatkozó szabályok érvénytelenek, és a
       böngésző az öröklött értékre esik vissza — a "Fiók létrehozása" gomb egy
       <Link>-en belül van, így a Bootstrap link-kékjét (#0d6efd) örökölte. A
       Bootstrap .btn-jén ráadásul szín-ÁTMENET van, ezért a kék nem eltűnt,
       hanem ~150 ms alatt átúszott a téma színébe: ez volt a látható villanás.

       A useLayoutEffect a DOM-módosítás után, de a festés ELŐTT fut — a
       változók így már az első képkockán megvannak, nincs mihez képest
       átmenetet játszani. Ára: blokkolja a festést, ezért CSAK az kerül ide,
       ami tényleg az első képkockához kell (hét stílus-beállítás, ennyi). */
    useLayoutEffect(() => {
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

        /* A gördítősáv nyilai. Miért ITT áll össze a kép, és nem a CSS-ben?

           A nyíl alakja nem rajzolható meg keretekből (a hátulja bemetszett), tehát
           kép kell hozzá — a beágyazott SVG viszont egy SZÖVEG: nem lát CSS-változót,
           így a téma színét sem. Ha beleégetnénk egy színt, a témaváltásnál hazuggá
           válna: a sötét téma sárgája a világos témán olvashatatlan.

           A kép ezért itt születik, ahol a szín ismert, és változóként megy a
           CSS-hez (index.css). A # jelet kódolni KELL (%23), különben az URL-ben
           töredék-jelnek számítana, és a kép némán üres maradna.

           A nyíl a 10-es viewBoxon belül szándékosan kisebb, mint a teljes kép: a
           kép a CSS-ben pontosan a gomb szélességét kapja, így nem marad fél
           pixel margó, amit a böngésző hol erre, hol arra kerekítene. (Mérve
           2026-07-17: 5 px-es kép a 6 px-es gombon 0,45 px-et csúszott a hüvelyk
           tengelyéhez képest — a felső nyíl jobbra, az alsó balra.) */
        const arrow = (path) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'` +
            ` viewBox='0 0 10 10'%3E%3Cpath d='${path}' fill='${theme.accent.replace("#", "%23")}'` +
            ` stroke='${theme.accent.replace("#", "%23")}' stroke-width='1'` +
            ` stroke-linejoin='round'/%3E%3C/svg%3E")`;
        html.style.setProperty("--scrollbar-arrow-up", arrow("M5 2 L8.2 8 L5 6.4 L1.8 8 Z"));
        html.style.setProperty("--scrollbar-arrow-down", arrow("M5 8 L1.8 2 L5 3.6 L8.2 2 Z"));
    }, [theme]);

    /* Sima useEffect (a festés UTÁN fut) — SZÁNDÉKOSAN, két okból is.

       A .theme-ready osztály engedi fel az átmeneteket (lásd index.css). Csak
       most tesszük ki, egy renderrel a változók beállítása után: így a fenti
       useLayoutEffect változásai biztosan átmenet NÉLKÜL érvényesülnek — ha
       ugyanabban a lépésben adnánk hozzá, a böngésző már engedélyezett
       átmenettel látná a színváltozást, és újra átúsztatná. A téma későbbi
       kézi váltása viszont már szépen átúszhat, mert az osztály addigra ott van.

       A sütiírás a KÖVETKEZŐ oldalbetöltéshez kell, nem ehhez a képkockához —
       a festést blokkoló useLayoutEffectbe csak az való, ami nélkül a kép hibás. */
    useEffect(() => {
        document.documentElement.classList.add("theme-ready");
        setCookie("backgroundColor", theme.cookieValue, {path: "/"});
        // Ebből festi az index.html boot-szkriptje a lapot, még a CSS előtt.
        setCookie("themeBackground", theme.pageBackground, {path: "/"});
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
