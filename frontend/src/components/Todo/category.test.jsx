import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import Category from "./category";

vi.mock("@fortawesome/react-fontawesome", () => ({FontAwesomeIcon: () => <span/>}));

const setup = (overrides = {}) => {
    const props = {
        category: "", categories: ["otthon", "munka"], color: "warning", isAngleClicked: false,
        setCategory: vi.fn(), setIsValid: vi.fn(), setIsAngleClicked: vi.fn(), handleAngleClick: vi.fn(), ...overrides,
    };
    render(<Category {...props}/>);
    return props;
};

describe("Category mező", () => {
    it("gépelésre beállítja a kategóriát és érvényesnek jelöli; üresre érvénytelennek", () => {
        /* Nem üres kezdőérték: a kontrollált mező value-trackere csak a kezdeti
           értéktől ELTÉRŐ change-et tüzeli el. "x"-ről indulva a "munka" és a ""
           is eltér, tehát mindkét ág lefut (üres kezdetről a "" elnyelődne). */
        const props = setup({category: "x"});
        const input = screen.getByPlaceholderText("Kategória");

        fireEvent.change(input, {target: {value: "munka"}});
        expect(props.setCategory).toHaveBeenCalledWith("munka");
        expect(props.setIsValid).toHaveBeenLastCalledWith(true);

        // Kiürítve a kategória már érvénytelen (a mező kötelező).
        fireEvent.change(input, {target: {value: ""}});
        expect(props.setIsValid).toHaveBeenLastCalledWith(false);
    });

    it("a legördülőből választott kategóriát átadja (setCategory)", () => {
        // Nyitott legördülő: a kategóriák gombként jelennek meg.
        const props = setup({isAngleClicked: true});

        fireEvent.click(screen.getByRole("button", {name: "munka"}));
        expect(props.setCategory).toHaveBeenCalledWith("munka");
    });
});
