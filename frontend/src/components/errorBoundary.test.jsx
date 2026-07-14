import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import ErrorBoundary from "./errorBoundary";

function Robbano() {
    throw new Error("szándékos teszthiba");
}

describe("ErrorBoundary", () => {
    it("normál esetben a gyerekeit rendereli", () => {
        render(<ErrorBoundary><p>tartalom</p></ErrorBoundary>);
        expect(screen.getByText("tartalom")).toBeVisible();
    });

    it("hiba esetén hibaképernyőt mutat, nem néma üres oldalt", () => {
        // A React a konzolba is kiírja az elkapott hibát — a teszt kimenetében
        // ez zaj lenne, ezért erre az egy tesztre elnémítjuk.
        const konzol = vi.spyOn(console, "error").mockImplementation(() => {});

        render(<ErrorBoundary><Robbano/></ErrorBoundary>);

        expect(screen.getByRole("heading", {name: /hiba történt/i})).toBeVisible();
        expect(screen.getByRole("button", {name: /újratöltés/i})).toBeVisible();
        konzol.mockRestore();
    });
});
