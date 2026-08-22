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

    it("az onAllSettled a HATÁRIDŐ UTÁN is lefut, amikor a mentés tényleg véget ér", async () => {
        /* Ez a második, KÉSŐBBI időpont: a felhasználót legfeljebb a határidőig
           várakoztatjuk, a mentés-lánc viszont tovább fut — és a végén épp az a
           piszkozat születik meg, ami a mentetlen munkát őrzi. A kijelentkezés
           ebből tudja meg, mikor NEM ÍRHAT már senki piszkozatot
           (contexts/auth.tsx: a piszkozat-kulcs eldobása). */
        let release = () => {};
        const unregister = registerPendingSave(() => new Promise<void>((resolve) => { release = resolve; }));
        let settled = false;

        // 10 ms-os határidő: a flush lejár, a mentés még fut.
        await flushPendingSaves(() => { settled = true; }, 10);
        expect(settled).toBe(false);

        release();
        await Promise.resolve();
        await Promise.resolve();

        expect(settled).toBe(true);
        unregister();
    });

    it("mentenivaló NÉLKÜL is szól a lefutásról", async () => {
        // Nincs bejelentkezett mentés: nincs mire várni, tehát azonnal "kész".
        let settled = false;

        await flushPendingSaves(() => { settled = true; });
        await Promise.resolve();

        expect(settled).toBe(true);
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
