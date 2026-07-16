/* Minden teszt előtt lefut. A jest-dom extra állításokat ad a vizsgálatokhoz
   (pl. toBeVisible, toHaveClass) — ezek nélkül csak nyers DOM-tulajdonságokat
   tudnánk ellenőrizni. */
import "@testing-library/jest-dom/vitest";
import {cleanup} from "@testing-library/react";
import {afterEach, vi} from "vitest";

/* A jsdom nem ismeri a matchMedia-t: nincs benne tényleges elrendezés, tehát
   nincs mihez képest eldöntenie, illeszkedik-e egy médialekérdezés. A
   böngészőben viszont szabványos API — nem a KÓD dolga védekezni a hiánya
   ellen, hanem a tesztkörnyezeté pótolni.

   Az alapértelmezés "nem illeszkedik", vagyis a tesztek széles képernyőt
   látnak. Ez egybevág a jsdom 1024 px-es ablakával, és a mi lekérdezésünk
   (max-width: 575.98px) ott valóban nem illeszkedne. */
if (typeof window !== "undefined" && !window.matchMedia) {
    window.matchMedia = (query) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),       // elavult, de néhány könyvtár még ezt hívja
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
    });
}

// Teszt után takarítunk: különben az előző teszt DOM-ja beleszólna a következőbe.
afterEach(cleanup);
