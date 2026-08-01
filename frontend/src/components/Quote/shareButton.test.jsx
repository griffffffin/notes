import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {act, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareButton from "./shareButton";
import {getOpenTooltipId, resetTooltips, setTooltipOpen} from "../../tooltipRegistry";

const ID = "6a6cc7bc8dca2d05004fcf39";

/* A jsdomban nincs vágólap, ezért a másolás-parancsot kémre cseréljük, és
   megjegyezzük, mit jelölt ki a kód — a KIMÁSOLT SZÖVEG a bizonyíték. A
   vágólap-modult SZÁNDÉKOSAN nem mockoljuk: így a gomb → cím-összeállítás →
   másolás teljes lánca fut, nem csak a gomb. */
let copiedText;

const arrangeClipboard = (succeeds = true) => {
    copiedText = null;
    document.execCommand = vi.fn(() => {
        const field = document.activeElement;
        copiedText = field?.value?.slice(field.selectionStart, field.selectionEnd);
        return succeeds;
    });
};

beforeEach(() => arrangeClipboard());
afterEach(resetTooltips);

/* NYITVA van-e a buborék? A lap közös tooltip-nyilvántartásából olvassuk, nem a
   react-tooltip DOM-jából: a könyvtár a buborékot SVG-horgonyhoz igazítva
   jsdomban nem mutatja meg (nincs elrendezés, a pozíció-számítás elhal), a
   nyitottság viszont a mi állapotunk, és éppen az a tesztelendő. */
const isOpen = () => getOpenTooltipId() === "share-tooltip";

describe("ShareButton", () => {
    it("a gomb megnyomására az idézet publikus címét másolja", async () => {
        render(<ShareButton author="Marcus Aurelius" quoteId={ID}/>);

        await userEvent.click(screen.getByRole("button", {name: "Megosztás"}));

        expect(copiedText).toBe(`${window.location.origin}/quotes/Marcus%20Aurelius/${ID}`);
    });

    // Névtelen idézet is megosztható — a címben az "Anonymous" jelölővel.
    it("névtelen idézetnél az Anonymous jelölős címet másolja", async () => {
        render(<ShareButton author="" quoteId={ID}/>);

        await userEvent.click(screen.getByRole("button", {name: "Megosztás"}));

        expect(copiedText).toBe(`${window.location.origin}/quotes/Anonymous/${ID}`);
    });

    /* A visszajelzés nem dísz: a vágólapra másolásnak nincs látható nyoma, a
       felhasználó csak ebből tudja meg, hogy megtörtént. A buborék csak akkor
       kerül a lapra, ha a gomb fölé érünk — ezért a hover a teszt része. */
    it("sikeres másolás után a buborék visszajelez", async () => {
        render(<ShareButton author="Örkény" quoteId={ID}/>);
        const button = screen.getByRole("button", {name: "Megosztás"});

        await userEvent.click(button);

        expect(await screen.findByText("Link másolva.")).toBeInTheDocument();
    });

    // A NÉMA kudarc a legrosszabb: ha a böngésző megtagadja, azt is kimondjuk.
    it("sikertelen másolásnál ezt is megmondja, nem hallgat", async () => {
        arrangeClipboard(false);
        render(<ShareButton author="Örkény" quoteId={ID}/>);

        await userEvent.click(screen.getByRole("button", {name: "Megosztás"}));

        expect(await screen.findByText("Sikertelen másolás.")).toBeInTheDocument();
    });

    /* REGRESSZIÓ: a második kattintás UGYANAZT a visszajelzés-szöveget állítja be,
       amit a React nem tekint változásnak — ha a buborék megnyitása ebből a
       változásból következne, a második kattintás némán nem csinálna semmit. Pedig
       közben a buborékot becsukhatta más (a "csak egy tooltip lehet nyitva" szabály:
       elég a betűméret-léptető fölé vinni a kurzort). Ezt a helyzetet a
       setTooltipOpen(false) állítja elő a teszt közepén. */
    it("másodszorra is kinyílik a buborék, ha közben más csukta be", async () => {
        render(<ShareButton author="Örkény" quoteId={ID}/>);
        const button = screen.getByRole("button", {name: "Megosztás"});
        await userEvent.click(button);
        await waitFor(() => expect(isOpen()).toBe(true));
        act(() => setTooltipOpen("share-tooltip", false));

        await userEvent.click(button);

        await waitFor(() => expect(isOpen()).toBe(true));
    });

    /* A gomb NEM súg hoverre: a "Megosztás" csak a képernyőolvasónak szóló név
       (aria-label), nem látható felirat — a user kifejezetten kérte, hogy ne
       jelenjen meg buborékként. */
    it("hoverre NEM nyílik ki semmilyen buborék", async () => {
        render(<ShareButton author="Örkény" quoteId={ID}/>);

        await userEvent.hover(screen.getByRole("button", {name: "Megosztás"}));

        expect(getOpenTooltipId()).toBeNull();
    });
});
