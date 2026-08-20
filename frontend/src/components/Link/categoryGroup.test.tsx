import {fireEvent, render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {MemoryRouter} from "react-router-dom";
import {CookiesProvider} from "react-cookie";
import {describe, expect, it, vi} from "vitest";
import {ThemeProvider} from "../../contexts/theme";
import CategoryGroup from "./categoryGroup";
import type {CategoryGroupProps} from "./categoryGroup";

/* AZ ÚJRATÖLTŐ IKON a kategória-legördülőben.

   Miért kellett: a hibaüzenet eddig KIÚT NÉLKÜL állt ott. A felhasználó egyetlen
   eszköze az F5 volt — az viszont az EGÉSZ alkalmazást újratölti (a bundle-t is),
   és mindent elvisz: a nyitott legördülőket, a görgetést, a szerkesztőbe beírt,
   még nem mentett szöveget. Az ikon ezzel szemben PONTOSAN azt az egy lekérést
   ismétli meg, ami elbukott.

   A legördülő a Navbaron át kapja a propokat (l. navbar.test.tsx a vezetékre);
   itt magát a viselkedést rögzítjük, mert a pörgés MEGÁLLÁSÁHOZ a `loading` prop
   váltása kell — az pedig rerenderrel a legpontosabb. */
/* A gomb NEVE a látható üzenet + a rejtett cselekvés-kiegészítés; a tesztek erre
   az egy, stabil darabjára illesztenek, hogy a két üzenetváltozat egyaránt
   megtalálható legyen. */
const RETRY = /Kattints az újratöltéshez/;

const renderGroup = (overrides: Partial<CategoryGroupProps> = {}) => {
    const props: CategoryGroupProps = {
        categories: ["otthon"], categoriesFailed: true, categoriesLoading: false,
        onRetry: vi.fn(), onClick: vi.fn(), ...overrides,
    };
    /* A kategória-hivatkozás (category.tsx) a témából veszi a színét, a
       ThemeProvider pedig sütiből olvas — ezért kell mindkét burkoló. */
    const wrap = (p: CategoryGroupProps) => (
        <CookiesProvider>
            <ThemeProvider>
                <MemoryRouter><CategoryGroup {...p}/></MemoryRouter>
            </ThemeProvider>
        </CookiesProvider>
    );
    const view = render(wrap(props));
    const rerender = (next: Partial<CategoryGroupProps>) => view.rerender(wrap({...props, ...next}));
    return {props, rerender};
};

// A FontAwesome a `spin` propból `fa-spin` osztályt tesz az SVG-re — a pörgést
// tehát ezen kérdezzük, nem a (jsdom-ban úgysem futó) animáción.
const icon = () => screen.getByRole("button", {name: RETRY}).querySelector("svg");
const isSpinning = () => icon()?.classList.contains("fa-spin");
/* A teljes fordulat jelzése MAGÁRÓL az SVG-ről megy: az animációt az viseli, és
   a komponens is ott figyel (nem a React szintetikus propján — l. categoryGroup.tsx). */
const fullTurn = () => {
    const svg = icon();
    if (!svg) throw new Error("nincs ikon, amin a fordulat véget érhetne");
    return svg;
};

describe("CategoryGroup — az újratöltő ikon", () => {
    it("CSAK a hiba mellett jelenik meg (kontroll: siker esetén nincs)", () => {
        renderGroup({categoriesFailed: false});

        expect(screen.queryByRole("button", {name: RETRY})).not.toBeInTheDocument();
    });

    it("hibánál megjelenik, és a kattintás MEGISMÉTLI a lekérést", async () => {
        const {props} = renderGroup();

        await userEvent.click(screen.getByRole("button", {name: RETRY}));

        expect(props.onRetry).toHaveBeenCalledTimes(1);
    });

    /* AZ EGÉSZ SOR KATTINTHATÓ, nem csak az ikon: az ÜZENET SZÖVEGÉRE kattintva
       is elindul az újratöltés. Ez nem stílus-kérdés — egy ikonnyi találati
       felület telefonon alig eltalálható. Az állítás a szövegből indul (arra
       kattint a felhasználó), és azt kérdezi, hogy a gombon belül van-e. */
    it("az ÜZENET SZÖVEGÉRE kattintva is elindul a lekérés", async () => {
        const {props} = renderGroup();

        await userEvent.click(screen.getByText("A további kategóriák betöltése sikertelen."));

        expect(props.onRetry).toHaveBeenCalledTimes(1);
    });

    it("ÜRES listánál is az egész sor kattintható (a másik üzenetváltozat)", async () => {
        const {props} = renderGroup({categories: []});

        await userEvent.click(screen.getByText("A kategóriák betöltése sikertelen."));

        expect(props.onRetry).toHaveBeenCalledTimes(1);
    });

    /* A LEGÖRDÜLŐ NE CSUKÓDJON BE. A kategória-hivatkozások onClickje (az app
       handleLinkClicked-je) becsukja a nyitott vezérlőket — ha az ikon ugyanezt
       kapná, a felhasználó pont az EREDMÉNYT nem látná: megnyomná az újratöltést,
       a legördülő eltűnne, és fogalma sem lenne, sikerült-e. */
    it("a kattintás NEM sül el a kategória-kattintás kezelőjén (a legördülő nyitva marad)", async () => {
        const {props} = renderGroup();

        await userEvent.click(screen.getByRole("button", {name: RETRY}));

        expect(props.onClick).not.toHaveBeenCalled();
    });

    // Alapból "submit" lenne, és egy űrlapba kerülve elsütné azt.
    it("a gomb type=button", () => {
        renderGroup();

        expect(screen.getByRole("button", {name: RETRY})).toHaveAttribute("type", "button");
    });

    it("a lekérés alatt forog", () => {
        renderGroup({categoriesLoading: true});

        expect(isSpinning()).toBe(true);
    });

    it("lekérés nélkül nem forog (kontroll)", () => {
        renderGroup({categoriesLoading: false});

        expect(isSpinning()).toBe(false);
    });

    /* A LÉNYEGI VISELKEDÉS: a pörgés nem a válasz pillanatában ér véget, hanem a
       következő TELJES fordulatnál. Enélkül az ikon egy fél fordulatból ugrana
       vissza alaphelyzetbe — az rándulás, nem befejezés. */
    it("a válasz után TOVÁBB forog, és csak a teljes fordulatnál áll meg", () => {
        const {rerender} = renderGroup({categoriesLoading: true});
        expect(isSpinning()).toBe(true);

        // A lekérés végzett — az ikon ettől MÉG NEM állhat meg.
        rerender({categoriesLoading: false});
        expect(isSpinning()).toBe(true);

        // A kör bezárult (0° → 360°): most, és csak most, áll meg.
        fireEvent.animationIteration(fullTurn());
        expect(isSpinning()).toBe(false);
    });

    it("ha KÖZBEN új lekérés indult, a fordulat végén sem áll meg", () => {
        const {rerender} = renderGroup({categoriesLoading: true});

        rerender({categoriesLoading: false});
        rerender({categoriesLoading: true});
        fireEvent.animationIteration(fullTurn());

        expect(isSpinning()).toBe(true);
    });
});
