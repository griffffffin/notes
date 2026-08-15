import {afterEach, describe, expect, it, vi} from "vitest";

/* A KONFIGURÁCIÓS KAPU TESZTJE. A backendUrl.ts a BETÖLTÉSEKOR dönt (nem egy
   függvényhívásban), ezért a tesztnek is a betöltést kell megismételnie:

     - `vi.stubEnv` átírja az env-értéket erre a tesztre;
     - `vi.resetModules` eldobja a modul-gyorsítótárat, különben a második
       `import()` a MÁR betöltött (és a saját env-jével kiértékelt) példányt adná
       vissza, és a teszt észre sem venné, hogy nem futott le újra;
     - a dinamikus `import()` promise-t ad, tehát a dobott hiba elutasításként
       jelentkezik — innen a `rejects`.

   A takarítás azért kell, hogy ezek a stubok ne szivárogjanak át a többi tesztre. */
afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
});

describe("BACKEND_URL", () => {
    it("HIÁNYZÓ VITE_BACKEND esetén beszédes hibával elszáll", async () => {
        /* Ez a valódi eset: env-fájl nélkül buildelt vagy telepített app. Ellenőrzés
           nélkül minden kérés az "undefined/…" címre menne — némán, 404-ekkel. */
        vi.stubEnv("VITE_BACKEND", undefined);
        vi.resetModules();

        await expect(import("./backendUrl")).rejects.toThrow(/VITE_BACKEND/);
    });

    it("az ÜRES string érvényes érték (éles build: relatív URL-ek)", async () => {
        /* Kontroll ÉS szerződés egyben: ha valaha `if (!url)`-re egyszerűsödne az
           ellenőrzés, az éles beállítást utasítaná el — ez a teszt akkor bukik. */
        vi.stubEnv("VITE_BACKEND", "");
        vi.resetModules();

        const {BACKEND_URL} = await import("./backendUrl");
        expect(BACKEND_URL).toBe("");
    });

    it("a megadott címet változatlanul adja tovább", async () => {
        vi.stubEnv("VITE_BACKEND", "http://192.168.0.2:3001");
        vi.resetModules();

        const {BACKEND_URL} = await import("./backendUrl");
        expect(BACKEND_URL).toBe("http://192.168.0.2:3001");
    });
});
