import {useState} from "react";
import {render, screen, waitFor} from "@testing-library/react";
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
