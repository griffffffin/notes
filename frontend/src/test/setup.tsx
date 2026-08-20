/* Minden teszt előtt lefut. A jest-dom extra állításokat ad a vizsgálatokhoz
   (pl. toBeVisible, toHaveClass) — ezek nélkül csak nyers DOM-tulajdonságokat
   tudnánk ellenőrizni. */
import "@testing-library/jest-dom/vitest";
import {cleanup} from "@testing-library/react";
import {forwardRef} from "react";
import {afterEach, vi} from "vitest";
import type {FontAwesomeIconProps} from "@fortawesome/react-fontawesome";

/* Az ikon-könyvtár GLOBÁLIS cseréje egy csupasz <svg>-re.

   Nem kényelmi kérdés: a valódi FontAwesome `library.add(fas)`-a mind az ~1600
   ikont behúzza, amit a Pi percekig transzformál — emiatt a tesztek időtúllépéssel
   szálltak el. Az ikonok kinézete amúgy sem tesztelhető jsdomban (nincs
   megjelenítés), a JELENLÉTÜK viszont igen: a data-icon attribútum megőrzi, melyik
   ikont kérte a komponens, így a rá épülő állítások (pl. a szem nyitott/csukott
   állapota) továbbra is működnek.

   Miért itt, és nem tesztfájlonként? Mert tíz tesztfájl írta le ugyanezt a három
   sort, két kissé eltérő változatban — ez zaj, nem a tesztek tárgya. Ha egy jövőbeli
   teszt mégis a VALÓDI könyvtárat kérné, a saját fájljában vi.unmock-olhatja.

   (A fájl azért .tsx, mert JSX-et tartalmaz: a Vite csak .jsx/.tsx kiterjesztésű
   fájlban fordítja a JSX-et.) */
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
   valódi könyvtár is az alapértelmezett készletet használná rá. A harmadik alak
   (IconLookup objektum) ma sehol nem szerepel, de a típus megengedi — ezért a
   pótlék is kezeli, hogy ne csendben "[object Object]"-et írjon ki.

   A pótlék <svg>-t ad (nem <span>-t), és forwardRef-fel készül: a valódi
   FontAwesomeIcon típusa `ForwardRefExoticComponent<… & RefAttributes<SVGSVGElement>>`,
   vagyis SVG-elemre mutató refet fogad. Egy nyers függvénykomponens nem felelne
   meg neki — és ez épp az a fajta eltérés, amit a lenti import()-os alak fog meg.

   A `vi.mock` a modult IMPORT-tal veszi át, nem string-útvonallal. A különbség
   nem stílus: a Vitest típusa a string-alaknál `Partial<unknown>`-t vár a gyártól,
   vagyis BÁRMIT elfogad; az import()-os alaknál a modul valódi típusához méri a
   mockot. Az `import type` sor mellette kitörlődik a fordításkor
   (verbatimModuleSyntax), tehát futásidőben nem hoz vissza semmit a mockolt
   modulból. */
vi.mock(import("@fortawesome/react-fontawesome"), () => ({
    /* A `size`/`mask`/`transform` a KÖNYVTÁR saját propjai, nem SVG-attribútumok
       (a valódi komponens osztályokká és transzformációvá dolgozza fel őket) —
       ezért itt kiemelve, nem a DOM-ba szórva. A `mask` és a `transform` nevét
       az SVG is ismeri, más típussal: a spreadben hagyva fordítási hibát adnak,
       vagyis a típus is ugyanoda mutat, ahová a józan ész. A maradék
       (className, onClick, style, aria-*) változatlanul átmegy. Az aláhúzás-előtag
       a linternek szól: a változó SZÁNDÉKOSAN kihasználatlan, csak a rest-ből
       való kiemelés miatt van neve. */
    FontAwesomeIcon: forwardRef<SVGSVGElement, FontAwesomeIconProps>(
        ({icon, size: _size, mask: _mask, transform: _transform, spin, className, ...rest}, ref) => {
            const [prefix, name] = Array.isArray(icon) ? icon
                : typeof icon === "object" ? [icon.prefix, icon.iconName]
                    : [undefined, icon];
            /* A `spin` ugyanígy a KÖNYVTÁR propja, nem SVG-attribútum — a valódi
               komponens OSZTÁLLYÁ alakítja. A név nem találgatás: a
               react-fontawesome saját leképező táblázatából olvastuk ki
               (`spin` → `fa-spin`), a keyframe-jeit pedig a main.tsx-ben
               importált FontAwesome-CSS hozza. Ha a spreadben hagynánk, a React "non-boolean attribute"
               figyelmeztetést adna, és `spin="false"` kerülne a DOM-ba — olyan
               alak, amit az éles app SOSEM állít elő; ha pedig csak kiemelnénk és
               eldobnánk, a pörgés tesztelhetetlen maradna.

               A `className` azért kerül ki a restből, hogy a kettőt össze
               tudjuk fűzni; ha egyik sincs, az attribútum ki sem íródik (ahogy
               eddig sem). */
            const classes = [className, spin ? "fa-spin" : undefined].filter(Boolean).join(" ");
            return <svg ref={ref} data-prefix={prefix} data-icon={name}
                        className={classes || undefined} {...rest}/>;
        }),
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
