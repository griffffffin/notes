import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {Cookies, CookiesProvider} from "react-cookie";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {ThemeProvider} from "./theme";
import {THEMES, useTheme} from "./theme-context";
import {COOKIES} from "../cookies";

/* Kis próbakomponens, ami kiírja, amit a Contextből kap — így a hookot
   önmagában, komponensfa nélkül tudjuk vizsgálni. */
function ThemeProbe() {
    const {color, colorHex, pageBackground, isChecked, handleCheckedChange} = useTheme();
    return (
        <div>
            <span data-testid="color">{color}</span>
            <span data-testid="hex">{colorHex}</span>
            <span data-testid="bg">{pageBackground}</span>
            <span data-testid="checked">{String(isChecked)}</span>
            <button onClick={handleCheckedChange}>váltás</button>
        </div>
    );
}

const renderWithTheme = () => render(
    <CookiesProvider>
        <ThemeProvider><ThemeProbe/></ThemeProvider>
    </CookiesProvider>
);

/* Ugyanaz, de SAJÁT Cookies-példánnyal, aminek a `set`-jét kémleljük. Így nem
   csak azt látjuk, hogy a süti értéke helyes-e (azt a document.cookie is
   megmutatja), hanem azt is, MILYEN BEÁLLÍTÁSOKKAL írjuk ki. A jsdom (és a
   böngésző) a `document.cookie`-ból csak a nevet és az értéket adja vissza — a
   Max-Age, a Path és a SameSite onnan VISSZAOLVASHATATLAN, tehát a
   könyvtárnak átadott beállítás az egyetlen hely, ahol számon kérhető. */
const renderWithCookieSpy = () => {
    const cookies = new Cookies();
    const setSpy = vi.spyOn(cookies, "set");
    render(
        <CookiesProvider cookies={cookies}>
            <ThemeProvider><ThemeProbe/></ThemeProvider>
        </CookiesProvider>
    );
    return setSpy;
};

/* A böngésző (és a jsdom) a színeket normalizálja: a "#fff"-ből "rgb(255,255,255)"
   lesz. Ezért nem a hex-szöveget hasonlítjuk, hanem ugyanazon az úton normalizált
   értékeket. */
function normalizedColor(color: string) {
    const element = document.createElement("div");
    element.style.background = color;
    return element.style.background;
}

describe("ThemeProvider", () => {
    beforeEach(() => {
        document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });

    it("süti nélkül a sötét témával indul", () => {
        renderWithTheme();
        expect(screen.getByTestId("bg")).toHaveTextContent(THEMES.dark.pageBackground);
        expect(screen.getByTestId("hex")).toHaveTextContent(THEMES.dark.accent);
        expect(screen.getByTestId("checked")).toHaveTextContent("false");
    });

    it("ISMERETLEN süti-értékre a sötét témával indul", () => {
        /* A süti a felhasználó gépén él: kézzel átírható, és egy régi verziótól is
           örökölhet értéket. A kezdőérték ezért EGYENLŐSÉG-vizsgálat a világos
           téma sajátjával (THEMES.light.cookieValue), nem "minden, ami nem
           fekete" — így bármi ismeretlen a biztonságos alapértelmezésre, a sötét
           témára esik, nem egy félig beállt állapotba. */
        document.cookie = "backgroundColor=lila; path=/";
        renderWithTheme();

        expect(screen.getByTestId("bg")).toHaveTextContent(THEMES.dark.pageBackground);
        expect(screen.getByTestId("checked")).toHaveTextContent("false");
    });

    it("a VILÁGOS téma süti-értékére világossal indul", () => {
        // Kontroll az előzőhöz: enélkül a fenti teszt attól is zöld lenne, ha a
        // Provider egyáltalán nem olvasna sütit.
        document.cookie = "backgroundColor=" + THEMES.light.cookieValue + "; path=/";
        renderWithTheme();

        expect(screen.getByTestId("bg")).toHaveTextContent(THEMES.light.pageBackground);
        expect(screen.getByTestId("checked")).toHaveTextContent("true");
    });

    it("a téma sütijei TÚLÉLIK a böngésző bezárását (van rajtuk lejárat)", () => {
        /* Lejárat nélkül a süti MUNKAMENET-süti: a böngésző bezárásakor eltűnik,
           és a világos témát választó felhasználó minden indításkor sötéten kapná
           vissza az appot — némán, hiszen semmi nem hibázik. (Mérve: a korábbi
           `{path: "/"}` pontosan ilyen sütit írt: `backgroundColor=white; Path=/`.)
           Egy megjelenítési beállítás nem munkamenet-adat: maradjon meg. */
        const setSpy = renderWithCookieSpy();

        for (const name of [COOKIES.theme, COOKIES.themeBackground]) {
            const call = setSpy.mock.calls.find(([cookieName]) => cookieName === name);
            expect(call, `A(z) ${name} sütit nem is írtuk ki.`).toBeDefined();
            expect(call?.[2]).toMatchObject({path: "/", maxAge: expect.any(Number)});
        }
    });

    it("kapcsolásra világos témára vált, és a html hátterét is átfesti", async () => {
        renderWithTheme();
        await userEvent.click(screen.getByRole("button", {name: "váltás"}));

        expect(screen.getByTestId("bg")).toHaveTextContent(THEMES.light.pageBackground);
        expect(screen.getByTestId("hex")).toHaveTextContent(THEMES.light.accent);
        // A fekete sáv-hiba ellen: a <html> háttere is kövesse a témát.
        expect(document.documentElement.style.background)
            .toBe(normalizedColor(THEMES.light.pageBackground));
    });

    it("a témát sütibe menti, hogy újratöltés után is megmaradjon", async () => {
        renderWithTheme();
        await userEvent.click(screen.getByRole("button", {name: "váltás"}));
        expect(document.cookie).toContain("backgroundColor=white");
    });

    it("a háttérszínt is sütibe írja — ebből fest az index.html boot-szkriptje", () => {
        // Enélkül a lap fehéret villanna a stíluslapok betöltéséig. A színt
        // szándékosan NEM hardkódoljuk a HTML-be: onnan csak olvassuk.
        renderWithTheme();
        expect(document.cookie).toContain("themeBackground=" + encodeURIComponent(THEMES.dark.pageBackground));
    });

    it("a színek osztálynév-utótagja 'theme' (a saját CSS-változós osztályainkhoz)", () => {
        renderWithTheme();
        expect(screen.getByTestId("color")).toHaveTextContent("theme");
    });

    it("ThemeProvider nélkül érthető hibát dob, nem rejtélyeset", () => {
        expect(() => render(<ThemeProbe/>)).toThrow(/ThemeProvider/);
    });
});

/* A BÖNGÉSZŐFÜL IKONJA (favicon) — a jin-jang két fele.

   A fület a böngésző rajzolja, oda a CSS-változóink nem érnek el, ezért a képet a
   Provider állítja össze SVG-szövegként, és a <link rel=icon> href-jébe írja.

   A SZABÁLY, amit ez a blokk rögzít: az a fél tartja meg az eredeti színét,
   amelyik A LAP HÁTTERÉVEL egyezik — a másik lesz az akcentus. Sötét témán tehát
   a fekete fél marad és a fehér vált sárgára, világoson pontosan fordítva. Így az
   akcentus MINDIG azon az oldalon van, amelyik a laptól elüt.

   MIÉRT ÉR EZ TESZTET. A szabályt korábban három bedrótozott literál írta le
   (`pageBackground !== "#000"`, majd "#fff" és "#000"), vagyis a THEMES tábla
   kézi másolatai. A legelső NÉMÁN romlott volna el: ha a sötét téma háttere
   egyszer "#0a0a0a" lesz, a vizsgálat tévesen világos témát mond, és az ikon
   invertálva jelenik meg — hibaüzenet nélkül, ráadásul olyan helyen (a fülön),
   ahova fejlesztés közben senki nem néz. Az alábbi elvárások ezért a THEMES-ből
   származnak, nem szó szerinti színekből: a színek szabadon változhatnak, a
   SZABÁLYNAK kell állnia. */
describe("favicon — a lap hátterével egyező fél tartja a színét", () => {
    beforeEach(() => {
        document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    });

    /* A jsdom alapdokumentumában NINCS <link rel=icon>, a Provider pedig
       `instanceof` őrrel dolgozik — elem híján CSENDBEN kihagyná a cserét, és a
       teszt semmit nem vizsgálna. Ezért magunk tesszük oda. */
    /* A `link` változó típusát a createElement adja (HTMLLinkElement), tehát a
       .href olvasásához itt nincs szükség semmilyen állításra — a visszaolvasó
       segéd viszont a DOM-ból keres, ahol az `instanceof` a VALÓDI ellenőrzés
       (nem `querySelector<HTMLLinkElement>`, ami csak állítaná; l. CLAUDE.md). */
    function currentFavicon(): string {
        const link = document.querySelector("link[rel=icon]");
        if (!(link instanceof HTMLLinkElement))
            throw new Error("Nincs <link rel=icon> a dokumentumban — a teszt nem vizsgálna semmit.");
        return decodeURIComponent(link.href);
    }

    function renderWithFavicon() {
        document.querySelector("link[rel=icon]")?.remove();
        const link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
        renderWithTheme();
        return currentFavicon();
    }

    it("sötét témán a FEKETE fél marad a lap háttere, a fehér lesz az akcentus", () => {
        const svg = renderWithFavicon();

        // A nagy korong (r=49.3) az eredeti FEHÉR fél; a <path> az eredeti FEKETE.
        expect(svg).toContain(`r="49.3" fill="${THEMES.dark.accent}"`);
        expect(svg).toContain(`<path fill="${THEMES.dark.pageBackground}"`);
    });

    it("világos témán fordítva: a FEHÉR fél marad, a fekete lesz az akcentus", async () => {
        const svg0 = renderWithFavicon();
        expect(svg0).toContain(`<path fill="${THEMES.dark.pageBackground}"`);  // kontroll: sötéten indult

        await userEvent.click(screen.getByRole("button", {name: "váltás"}));
        const svg = currentFavicon();

        expect(svg).toContain(`r="49.3" fill="${THEMES.light.pageBackground}"`);
        expect(svg).toContain(`<path fill="${THEMES.light.accent}"`);
    });
});
