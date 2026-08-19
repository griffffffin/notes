import {describe, expect, it, vi} from "vitest";
import {flushPendingSaves, registerPendingSave} from "./pendingSave";

/* A FÜGGŐ MENTÉSEK REGISZTERE — a kijelentkezés ezen át várja meg a szerkesztőt.

   Amit bizonyítani kell: a bejelentkezett mentés tényleg LEFUT és a flush MEGVÁRJA
   (különben a kijelentkezés ugyanúgy elszaladna mellette, mint eddig), a
   kiiratkozás után viszont NEM fut le (különben egy levált szerkesztő mentése
   szólalna meg egy másik munkamenetben), és egy elbukott mentés NEM akadályozza
   meg a kilépést. */

describe("pendingSave", () => {
    it("a flush MEGVÁRJA a bejelentkezett mentést", async () => {
        let finished = false;
        const unregister = registerPendingSave(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            finished = true;
        });

        await flushPendingSaves();

        expect(finished).toBe(true);
        unregister();
    });

    it("kiiratkozás után NEM fut le", async () => {
        const save = vi.fn(async () => {});
        const unregister = registerPendingSave(save);

        unregister();
        await flushPendingSaves();

        expect(save).not.toHaveBeenCalled();
    });

    it("TÖBB bejelentkezett mentést is megvár", async () => {
        const done: string[] = [];
        const first = registerPendingSave(async () => { done.push("első"); });
        const second = registerPendingSave(async () => { done.push("második"); });

        await flushPendingSaves();

        expect(done).toHaveLength(2);
        first();
        second();
    });

    it("egy ELBUKOTT mentés nem akadályozza meg a kilépést", async () => {
        /* A mentés saját hibaága (újrapróbálás, majd piszkozat) már lefutott —
           a felhasználó kilépni akart, ezt egy sikertelen mentés nem írhatja
           felül. Ezért a flush nem utasítódik el, hanem teljesül. */
        const unregister = registerPendingSave(() => Promise.reject(new Error("Network Error")));

        await expect(flushPendingSaves()).resolves.toBeUndefined();

        unregister();
    });
});
