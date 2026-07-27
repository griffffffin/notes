import {useState} from "react";
import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import AuthorInput from "./authorInput";

const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {handleAxios: fn}};
});
vi.mock("../../contexts/auth-context", () => ({useAuth: () => auth}));

/* Az AuthorInput kontrollált (a value kívülről jön), ezért egy pici szülőbe
   ágyazzuk, ami state-ben tartja — mint a QuoteSave. */
function Wrapper() {
    const [value, setValue] = useState("");
    return <AuthorInput value={value} onChange={(event) => setValue(event.target.value)}
                        placeholder="Szerző" class=""/>;
}

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/quotes/authors") then({data: ["Márai"]});
        return Promise.resolve();
    });
});

describe("AuthorInput — ghost-text", () => {
    it("gépelésre a beírt prefixszel kér javaslatot, és a folytatást halványan mutatja", async () => {
        render(<Wrapper/>);
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Má");

        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/authors");
            expect(call?.[1]).toEqual({prefix: "Má"});
        });
        // A kiegészítés a beírt UTÁN: "Má" + halvány "rai".
        expect(await screen.findByText("rai")).toBeInTheDocument();
    });

    it("Enter elfogadja az EGÉSZ kiegészítést", async () => {
        render(<Wrapper/>);
        const input = screen.getByPlaceholderText("Szerző");
        await userEvent.type(input, "Má");
        await screen.findByText("rai");

        await userEvent.type(input, "{Enter}");
        expect(input).toHaveValue("Márai");
    });

    it("Enter elfogadáskor a JAVASLAT írásmódját veszi át (kisbetűs prefix → tárolt alak)", async () => {
        render(<Wrapper/>);
        const input = screen.getByPlaceholderText("Szerző");
        await userEvent.type(input, "má");        // kisbetűvel gépel
        await screen.findByText("rai");
        await userEvent.type(input, "{Enter}");
        expect(input).toHaveValue("Márai");        // a tárolt alakot kapja, nem "márai"-t
    });

    it("a jobbra-nyíl a szöveg végén EGY betűt húz be (telefonos fokozatos elfogadás)", async () => {
        render(<Wrapper/>);
        const input = screen.getByPlaceholderText("Szerző");
        await userEvent.type(input, "Má");
        await screen.findByText("rai");

        await userEvent.type(input, "{ArrowRight}");
        expect(input).toHaveValue("Már");
    });

    it("nem villant fel kiegészítést, ha a beírt szöveg NEM a javaslat eleje", async () => {
        handleAxios.mockImplementation((url, data, then) => {
            if (url === "/quotes/authors") then({data: ["Kosztolányi"]});
            return Promise.resolve();
        });
        render(<Wrapper/>);
        await userEvent.type(screen.getByPlaceholderText("Szerző"), "Má");

        // A javaslat "Kosztolányi", de a beírt "Má" nem a kezdete — nincs ghost.
        await waitFor(() => expect(handleAxios.mock.calls.some((c) => c[0] === "/quotes/authors")).toBe(true));
        expect(screen.queryByText(/nyi$/)).not.toBeInTheDocument();
    });
});

/* Kereső mód: onSubmit megadva az Enter a KERESÉST indítja, nem a javaslatot
   fogadja el (a navbar keresője így viselkedik). A javaslat-átvétel ilyenkor a
   jobbra-nyílon marad — az továbbra is működik. */
function SearchWrapper({onSubmit}) {
    const [value, setValue] = useState("");
    return <AuthorInput value={value} onChange={(event) => setValue(event.target.value)}
                        onSubmit={onSubmit} placeholder="Keresés" class=""/>;
}

describe("AuthorInput — kereső mód (onSubmit)", () => {
    it("Enter a keresést INDÍTJA, és NEM fogadja el a javaslatot", async () => {
        const onSubmit = vi.fn();
        render(<SearchWrapper onSubmit={onSubmit}/>);
        const input = screen.getByPlaceholderText("Keresés");
        await userEvent.type(input, "Má");
        await screen.findByText("rai");   // a ghost-text megjelenik

        await userEvent.type(input, "{Enter}");

        expect(onSubmit).toHaveBeenCalled();
        // A mező NEM egészült ki "Márai"-ra — a keresés a beírt "Má"-val megy.
        expect(input).toHaveValue("Má");
    });

    it("a jobbra-nyíl kereső módban is behúz a javaslatból (átvétel megmarad)", async () => {
        render(<SearchWrapper onSubmit={vi.fn()}/>);
        const input = screen.getByPlaceholderText("Keresés");
        await userEvent.type(input, "Má");
        await screen.findByText("rai");

        await userEvent.type(input, "{ArrowRight}");
        expect(input).toHaveValue("Már");
    });

    it("Escape üríti a keresőmezőt", async () => {
        render(<SearchWrapper onSubmit={vi.fn()}/>);
        const input = screen.getByPlaceholderText("Keresés");
        await userEvent.type(input, "Má");
        expect(input).toHaveValue("Má");

        await userEvent.type(input, "{Escape}");
        expect(input).toHaveValue("");
    });

    it("ÉRINTÉSSEL a mezőre koppintva elfogadja az EGÉSZ javaslatot, de NEM keres", async () => {
        const onSubmit = vi.fn();
        render(<SearchWrapper onSubmit={onSubmit}/>);
        const input = screen.getByPlaceholderText("Keresés");
        await userEvent.type(input, "Má");
        await screen.findByText("rai");

        fireEvent.pointerUp(input, {pointerType: "touch"});
        expect(input).toHaveValue("Márai");        // elfogadta
        expect(onSubmit).not.toHaveBeenCalled();   // de NEM indított keresést
    });

    it("EGÉRKATTINTÁS (nem érintés) NEM fogadja el a javaslatot", async () => {
        render(<SearchWrapper onSubmit={vi.fn()}/>);
        const input = screen.getByPlaceholderText("Keresés");
        await userEvent.type(input, "Má");
        await screen.findByText("rai");

        fireEvent.pointerUp(input, {pointerType: "mouse"});
        expect(input).toHaveValue("Má");           // marad, ahogy beírtam
    });

    it("ÜRES mezőn a Backspace leveszi a fókuszt (mobil összecsukás)", async () => {
        render(<SearchWrapper onSubmit={vi.fn()}/>);
        const input = screen.getByPlaceholderText("Keresés");
        await userEvent.click(input);
        expect(input).toHaveFocus();

        await userEvent.keyboard("{Backspace}");
        expect(input).not.toHaveFocus();
    });
});

/* Kereső mód: a commitolt kifejezés (amit a mező az aktuális nézethez mutat)
   UNFÓKUSZÁLTAN középre igazít, és NEM villan rá ghost — csak ha belekattintok. */
function CommittedWrapper({initial}) {
    const [value, setValue] = useState(initial);
    return <AuthorInput value={value} onChange={(event) => setValue(event.target.value)}
                        onSubmit={vi.fn()} placeholder="Keresés" class=""/>;
}

describe("AuthorInput — kereső mód: igazítás és fókusz-alapú ghost", () => {
    it("commitolt kifejezés unfókuszáltan KÖZÉPRE, fókuszban BALRA igazít", async () => {
        render(<CommittedWrapper initial="Ady"/>);
        const input = screen.getByPlaceholderText("Keresés");

        expect(input).toHaveStyle({textAlign: "center"});   // van érték, nincs fókusz
        await userEvent.click(input);
        expect(input).toHaveStyle({textAlign: "left"});      // fókuszban
    });

    it("üres mezőnél (placeholder) BALRA igazít", () => {
        render(<CommittedWrapper initial=""/>);
        expect(screen.getByPlaceholderText("Keresés")).toHaveStyle({textAlign: "left"});
    });

    it("fókusz NÉLKÜL nincs ghost a commitolt kifejezésre; belekattintva megjelenik", async () => {
        render(<CommittedWrapper initial="Má"/>);
        // Fókusz nélkül nem indul javaslat-lekérés (a debounce-nál is tovább várva).
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(screen.queryByText("rai")).not.toBeInTheDocument();

        await userEvent.click(screen.getByPlaceholderText("Keresés"));
        expect(await screen.findByText("rai")).toBeInTheDocument();
    });
});
