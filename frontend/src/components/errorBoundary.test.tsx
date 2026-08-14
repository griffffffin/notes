import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import type {ReactNode} from "react";
import ErrorBoundary from "./errorBoundary";

/* A visszatérési típus KIMONDVA `ReactNode`: a fordító különben a törzsből
   `never`-t következtet (a függvény csak dob, sosem tér vissza), és egy `never`
   visszatérésű függvényt nem fogad el JSX-komponensként. A komponens dolga itt
   éppen a dobás — a hibahatár ezt kapja el. */
function Exploding(): ReactNode {
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
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        render(<ErrorBoundary><Exploding/></ErrorBoundary>);

        expect(screen.getByRole("heading", {name: /hiba történt/i})).toBeVisible();
        expect(screen.getByRole("button", {name: /újratöltés/i})).toBeVisible();
        consoleError.mockRestore();
    });
});
