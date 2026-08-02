import {screen, waitFor} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {renderRoutes} from "../../test/renderRoutes";


const QUOTES = [
    {_id: "a", quote: "Első idézet", author: "Márai", order: 1},
    {_id: "b", quote: "Második idézet", author: "", order: 2},
];

const {handleAxios, auth} = vi.hoisted(() => {
    const fn = vi.fn();
    return {handleAxios: fn, auth: {isLoggedIn: true, handleAxios: fn}};
});
vi.mock("../../contexts/auth-context", () => ({useAuth: () => auth}));

beforeEach(() => {
    handleAxios.mockReset();
    handleAxios.mockImplementation((url, data, then) => {
        if (url === "/quotes" || url === "/quotes/author") then({data: QUOTES});
        else then({status: 200, data: {}});
        return Promise.resolve();
    });
});

afterEach(() => {
    // A világos-téma sütit töröljük, hogy a többi teszt az alap (sötét) témával induljon.
    document.cookie = "backgroundColor=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

describe("QuoteRead", () => {
    it("kilistázza az idézeteket a szövegükkel", async () => {
        renderRoutes("/quotes");
        expect(await screen.findByText("Első idézet")).toBeVisible();
        expect(screen.getByText("Második idézet")).toBeVisible();
    });

    it("egy szerzőre szűrve a (dekódolt) nevet küldi a /quotes/author szűrőben", async () => {
        // A %C3%A1 az "á"; a Link encodeURIComponenttel kódol, a router dekódol.
        renderRoutes("/quotes/M%C3%A1rai");
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/author");
            expect(call?.[1]).toEqual({author: "Márai"});
        });
    });

    it("az Anonymous URL-szegmens a NÉVTELEN idézeteket szűri (üres szerző)", async () => {
        renderRoutes("/quotes/Anonymous");
        await waitFor(() => {
            const call = handleAxios.mock.calls.find((c) => c[0] === "/quotes/author");
            expect(call?.[1]).toEqual({author: ""});
        });
    });

    it("a szerző-szűrt nézetben a téma-akcentus PIROSRA vált (#db1937)", async () => {
        renderRoutes("/quotes/M%C3%A1rai");
        await screen.findByText("Első idézet");
        // Az EGÉSZ app akcentusa (a html --theme-accent) piros lesz — ebből fest a
        // navbar, a scrollbar, a gombok és a kártyák is.
        await waitFor(() =>
            expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#db1937"));
    });

    it("a teljes listában az akcentus a TÉMÁÉ marad (nem piros)", async () => {
        renderRoutes("/quotes");
        await screen.findByText("Első idézet");
        expect(document.documentElement.style.getPropertyValue("--theme-accent")).not.toBe("#db1937");
    });

    it("a quotes-lista VILÁGOS témán a szekció tinta-kékjét kapja (#284ec0, nem a globális #0b5ed7)", async () => {
        // Világos témával indítunk (a ThemeProvider a backgroundColor sütiből olvassa).
        document.cookie = "backgroundColor=white; path=/";
        renderRoutes("/quotes");
        await screen.findByText("Első idézet");
        // A szekció-override (useQuoteAccent) egy effektben áll be — waitForrel várjuk ki.
        await waitFor(() =>
            expect(document.documentElement.style.getPropertyValue("--theme-accent")).toBe("#284ec0"));
    });
});
