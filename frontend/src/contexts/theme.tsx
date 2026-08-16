import {useCallback, useEffect, useLayoutEffect, useMemo, useState} from "react";
import type {ReactNode} from "react";
import {useCookies} from "react-cookie";
import {THEMES, ThemeContext} from "./theme-context";
import {COOKIES, PERSISTENT_COOKIE} from "../cookies";
import {CSS_VARIABLES, setCssVariable} from "../cssVariables";
import type {AccentOverride, Theme} from "./theme-context";

export function ThemeProvider({children}: {children: ReactNode}) {
    const [cookies, setCookie] = useCookies([COOKIES.theme, COOKIES.themeBackground]);
    /* A kapcsoló bekapcsolva = világos téma. A kezdőérték a sütiből jön, hogy ne
       kelljen egy fölösleges rendert várni rá.

       Az összehasonlítás a THEMES-ből veszi az értéket, nem egy ideírt "white"
       literálból: az a világos téma `cookieValue`-jának kézi másolata volt, és ha
       az érték egyszer megváltozik, a másolat némán hamissá válik — az app MINDIG
       sötéten indulna, hiába világos a süti. (A süti értéke amúgy `any`, de ez az
       egyenlőség-vizsgálat maga a futásidejű ellenőrzés: csak a pontos egyezés
       ad igazat, bármi más — objektum, undefined — hamisat.) */
    const [isLight, setIsLight] = useState(cookies[COOKIES.theme] === THEMES.light.cookieValue);

    const theme = isLight ? THEMES.light : THEMES.dark;

    /* Szekció-akcentus felülírás: egy nézet (pl. a szerző-szűrt idézet-lista)
       ideiglenesen mással válthatja ki a téma kiemelőszínét — a setAccentOverride-ot
       a context adja tovább, a nézet mountkor beállítja, unmountkor null-ra teszi.
       Az EFFEKTÍV kiemelőszín ezért az override, ha van, különben a témáé; így a
       --theme-accent-re épülő MINDEN elem (navbar, scrollbar, gombok, toggle-
       ragyogás, kártyák) EGYÜTT vált, mindkét témában. */
    /* A típus KIMONDVA: a `null` kezdőértékből a fordító azt hinné, hogy ez a
       state örökre null marad, és minden későbbi beállítást hibának venne. Ez a
       "szűk kezdőérték" csapdája — ugyanaz, mint a tooltipRegistry openId-jénél. */
    const [accentOverride, setAccentOverride] = useState<AccentOverride | null>(null);
    const accent = accentOverride?.accent ?? theme.accent;
    const focusBorder = accentOverride?.focusBorder ?? theme.focusBorder;
    const focusRing = accentOverride?.focusRing ?? theme.focusRing;

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
        /* A változók NEVE a cssVariables.ts-ből jön, nem ideírt szövegként: az
           index.css ugyanezeket a neveket olvassa `var(--…)`-ral, és a kettő
           elcsúszása néma (a szabály érvénytelen lesz, a szín az öröklöttre esik
           vissza). A kötést a cssVariables.test.ts őrzi. */
        setCssVariable(html.style, CSS_VARIABLES.pageBackground, theme.pageBackground);
        setCssVariable(html.style, CSS_VARIABLES.text, theme.text);
        setCssVariable(html.style, CSS_VARIABLES.accent, accent);
        setCssVariable(html.style, CSS_VARIABLES.accentContrast, theme.accentContrast);
        setCssVariable(html.style, CSS_VARIABLES.focusBorder, focusBorder);
        setCssVariable(html.style, CSS_VARIABLES.focusRing, focusRing);

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
        const arrow = (path: string) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'` +
            ` viewBox='0 0 10 10'%3E%3Cpath d='${path}' fill='${accent.replace("#", "%23")}'` +
            ` stroke='${accent.replace("#", "%23")}' stroke-width='1'` +
            ` stroke-linejoin='round'/%3E%3C/svg%3E")`;
        setCssVariable(html.style, CSS_VARIABLES.scrollbarArrowUp, arrow("M5 2 L8.2 8 L5 6.4 L1.8 8 Z"));
        setCssVariable(html.style, CSS_VARIABLES.scrollbarArrowDown, arrow("M5 8 L1.8 2 L5 3.6 L8.2 2 Z"));

        /* A böngészőfül jin-jang ikonja a témát viseli: az egyik fele a kiemelő-
           szín, a másik a lap háttere (sötét témán sárga-fekete, világoson
           kék-fehér). A geometria a public/favicon.svg-ével AZONOS — csak a két
           szín cserélődik —, hogy a méret ne változzon.

           Miért itt, JS-ből, és nem a favicon.svg-ben? Mert a fület a böngésző
           rajzolja, oda a CSS-változóink nem érnek el; a beágyazott SVG pedig
           szöveg, nem lát változót. A képet tehát itt, a színek ismeretében
           állítjuk össze, és a <link rel="icon"> href-jét cseréljük. A statikus
           favicon.svg a boot-pillanat tartaléka marad (az alapértelmezett, sötét
           téma színeivel), amíg ez a csere le nem fut. */
        /* A favicon is az EFFEKTÍV akcentust viseli (a fenti `accent`) — így a fül
           ikonja is jelzi a szekció-módot (pl. a szerző-szűrt nézet pirosát). */
        /* A klasszikus jin-jang, de a HÁTTÉRREL KONTRASZTOS fele a kiemelőszínre
           cserélve. Sötét témán a lap fekete, tehát a fehér fél lesz accent
           (sárga), a fekete marad; világoson a lap fehér, tehát a fekete fél lesz
           accent (kék), a fehér marad. Így az accent mindig azon az oldalon van,
           amelyik a lap hátterétől elüt — az accent tehát témánként OLDALT VÁLT.

           A szemek a klasszikus kontraszt: mindegyik a MÁSIK fél színét viseli
           (accent-mezőben a semleges, semleges mezőben az accent) — így egyik sem
           tűnik el a saját mezőjében.

           A körvonal a kiemelőszín. Elég vastagnak kell lennie, hogy egy 32 px-es
           fülön is látsszon (mérve: 1,4-es vonal ott eltűnik); a konkrét értéket
           lásd lentebb. A viewBox tágabb a 100-asnál, hogy a körvonal kifelé eső
           fele elférjen — a korong geometriája így változatlan.

           A körvonal külön elem, és SZÁNDÉKOSAN a legfelső réteg: ha a fill-lel
           együtt egy circle-ön ülne, a sötét felet rajzoló path elfedné a befelé
           eső felét azon az oldalon, és a körvonal csak félvastagnak látszana ott
           (mérve: a fekete fél oldalán fele annyinak, mint a fehérén). Legfelső
           rétegként mindenhol a teljes vastagság látszik. */
        /* A SZABÁLY EGY MONDATBAN: az a fél tartja meg az eredeti színét, amelyik
           a LAP HÁTTERÉVEL egyezik; a másik lesz az akcentus. Sötét témán tehát a
           fekete fél marad (a háttér is fekete), és a fehér vált sárgára; világoson
           fordítva. Ezért mindkét "megmaradó" fél a theme.pageBackground.

           EZ EDDIG HÁROM BEDRÓTOZOTT LITERÁLLAL volt leírva: `pageBackground !== "#000"`
           döntötte el a témát, és a két megmaradó fél is "#fff"/"#000" volt. Mindhárom
           a THEMES tábla kézi másolata (theme-context.ts) — és a legelső NÉMÁN romlott
           volna el: ha a sötét téma háttere egyszer "#0a0a0a" lesz, a vizsgálat
           tévesen VILÁGOS témát mond, és a böngészőfül ikonja invertálva jelenik meg.
           Semmi nem hibázik, csak rossz. Az `isLight` maga az állapot, ami a témát
           választja — ugyanabban a komponensben, karnyújtásnyira. */
        const brightHalf = isLight ? theme.pageBackground : accent;  // az eredeti FEHÉR fél (bal)
        const darkHalf = isLight ? accent : theme.pageBackground;    // az eredeti FEKETE fél (jobb)
        const favicon = "data:image/svg+xml," + encodeURIComponent(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 108 108">` +
            `<circle cx="50" cy="50" r="49.3" fill="${brightHalf}"/>` +
            `<path fill="${darkHalf}" d="M50 0.7a49.3 49.3 0 0 1 0 98.6a24.65 24.65 0 0 1 0-49.3a24.65 24.65 0 0 0 0-49.3"/>` +
            `<circle cx="50" cy="26.2" r="6.2" fill="${darkHalf}"/>` +
            `<circle cx="50" cy="73.8" r="6.2" fill="${brightHalf}"/>` +
            `<circle cx="50" cy="50" r="49.3" fill="none" stroke="${accent}" stroke-width="5.4"/></svg>`);
        /* A querySelector általános `Element`-et ad, aminek nincs `href` mezője.
           A `querySelector<HTMLLinkElement>` alak csak ÁLLÍTANÁ, hogy link elem —
           az `instanceof` meg is nézi. A `if (link)` amúgy is kellett, tehát ez
           nem plusz sor, csak erősebb feltétel. */
        const link = document.querySelector("link[rel=icon]");
        if (link instanceof HTMLLinkElement) link.href = favicon;
    }, [theme, accent, focusBorder, focusRing, isLight]);

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
        setCookie(COOKIES.theme, theme.cookieValue, PERSISTENT_COOKIE);
        // Ebből festi az index.html boot-szkriptje a lapot, még a CSS előtt (a
        // kulcsnév kettősségét a themeBoot.test.ts őrzi).
        setCookie(COOKIES.themeBackground, theme.pageBackground, PERSISTENT_COOKIE);
    }, [theme, setCookie]);

    const value: Theme = useMemo(() => ({
        // Bootstrap-stílusú osztálynév-végződés: a komponensek "text-" + color
        // formában fűzik — a "theme" végződéshez az index.css saját osztályai
        // tartoznak (.text-theme, .btn-theme, ...), CSS-változókból színezve.
        color: "theme",
        // Az EFFEKTÍV akcentus (szekció-override, ha van) — pl. a toggle-ragyogás
        // (Switch colorHex) ebből is pirosra vált a szerző-szűrt nézetben.
        colorHex: accent,
        pageBackground: theme.pageBackground,
        todoDefaultColor: theme.todoDefaultColor,
        isChecked: isLight,
        handleCheckedChange,
        // A szekció-akcentus felülírása (a nézet mountkor beállítja, unmountkor null).
        setAccentOverride,
    }), [theme, accent, isLight, handleCheckedChange]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
