/* Minden teszt előtt lefut. A jest-dom extra állításokat ad a vizsgálatokhoz
   (pl. toBeVisible, toHaveClass) — ezek nélkül csak nyers DOM-tulajdonságokat
   tudnánk ellenőrizni. */
import "@testing-library/jest-dom/vitest";
import {cleanup} from "@testing-library/react";
import {afterEach, vi} from "vitest";

/* Az ikon-könyvtár GLOBÁLIS cseréje egy egyszerű <span>-re.

   Nem kényelmi kérdés: a valódi FontAwesome `library.add(fas)`-a mind az ~1600
   ikont behúzza, amit a Pi percekig transzformál — emiatt a tesztek időtúllépéssel
   szálltak el. Az ikonok kinézete amúgy sem tesztelhető jsdomban (nincs
   megjelenítés), a JELENLÉTÜK viszont igen: a data-icon attribútum megőrzi, melyik
   ikont kérte a komponens, így a rá épülő állítások (pl. a szem nyitott/csukott
   állapota) továbbra is működnek.

   Miért itt, és nem tesztfájlonként? Mert tíz tesztfájl írta le ugyanezt a három
   sort, két kissé eltérő változatban — ez zaj, nem a tesztek tárgya. Ha egy jövőbeli
   teszt mégis a VALÓDI könyvtárat kérné, a saját fájljában vi.unmock-olhatja.

   (A fájl azért .jsx, mert JSX-et tartalmaz: a Vite csak .jsx-ben fordítja.) */
/* A pótlék a VALÓDI FontAwesome kimenetét utánozza, nem egy saját alakot: a
   könyvtár KÉT attribútumot tesz ki az <svg>-re (fontawesome-svg-core:
   `'data-prefix': prefix, 'data-icon': iconName`), tehát a data-icon CSAK az
   ikon neve, a készlet külön mezőben áll.

   Ezt korábban elrontottuk: a mock a [prefix, név] tömböt szóközzel fűzte össze,
   így `data-icon="fas plus"` lett — olyan alak, amit az éles alkalmazás SOSEM
   állít elő —, a szelektorok pedig ehhez igazodtak. Egy mock akkor ér valamit,
   ha a valóság helyett áll be; ha saját szabályt talál ki, a tesztek azt a
   szabályt rögzítik, nem a viselkedést. (Következmény: a fenti javaslat — hogy
   egy teszt vi.unmock-olhatja és a valódi könyvtárat kérheti — a régi alakkal
   azonnal elbukott volna minden ikon-szelektoron.)

   A rendezés a hívási alakot követi: `icon={["fas", "plus"]}` a mai, ellenőrzött
   forma; a csupasz szöveges alak (`icon="plus"`) prefix nélkül marad, mert a
   valódi könyvtár is az alapértelmezett készletet használná rá. */
vi.mock("@fortawesome/react-fontawesome", () => ({
    FontAwesomeIcon: ({icon, ...rest}) => {
        const [prefix, name] = Array.isArray(icon) ? icon : [undefined, String(icon)];
        return <span data-prefix={prefix} data-icon={name} {...rest}/>;
    },
}));

/* A jsdom nem ismeri a matchMedia-t: nincs benne tényleges elrendezés, tehát
   nincs mihez képest eldöntenie, illeszkedik-e egy médialekérdezés. A
   böngészőben viszont szabványos API — nem a KÓD dolga védekezni a hiánya
   ellen, hanem a tesztkörnyezeté pótolni.

   Az alapértelmezés "nem illeszkedik", vagyis a tesztek széles képernyőt
   látnak. Ez egybevág a jsdom 1024 px-es ablakával, és a mi lekérdezésünk
   (max-width: 575.98px) ott valóban nem illeszkedne. */
if (typeof window !== "undefined" && !window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),       // elavult, de néhány könyvtár még ezt hívja
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    });
}

/* A jsdom a ResizeObservert sem ismeri — ugyanabból az okból, mint a matchMediát:
   nincs benne elrendezés, tehát nincs mit "átméretezni". A böngészőben viszont
   szabványos API, és a react-tooltip a MEGNYITOTT buborékot ezzel tartja a
   horgonyán (a floating-ui autoUpdate-je kéri). Enélkül minden olyan teszt
   elszáll, amelyik ténylegesen kinyit egy tooltipet.

   A pótlék szándékosan üres: figyel, de sosem jelez — jsdomban úgysem változna
   semmi mérete, a tooltip pedig a megnyitáskori pozíciójában marad. */
if (typeof globalThis.ResizeObserver === "undefined") {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// Teszt után takarítunk: különben az előző teszt DOM-ja beleszólna a következőbe.
afterEach(cleanup);
