import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {CookiesProvider} from "react-cookie";
import {beforeEach, describe, expect, it} from "vitest";
import {ThemeProvider} from "./theme";
import {THEMES, useTheme} from "./theme-context";

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
