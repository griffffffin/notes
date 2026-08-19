import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import * as v from "valibot";
import {clearDraft, draftKey, readDraft, saveDraft} from "./drafts";

/* A PISZKOZAT tesztjei.

   Amit bizonyítani kell: a mentetlen munka helyi másolata (a) tényleg megmarad,
   (b) csak akkor kerül vissza, ha ÉRTELMEZHETŐ, és (c) nem marad ott örökre.

   A (b) a legfontosabb: a localStorage tartalmát a felhasználó, egy böngésző-
   kiegészítő vagy egy RÉGEBBI appverzió is írhatta — ez kívülről jövő érték,
   tehát sémával olvassuk. A rossz alak nem "üres piszkozat", hanem NINCS
   piszkozat, és a szemetet takarítjuk is. */

const schema = v.object({quote: v.string(), order: v.number()});
const KEY = draftKey("quotes", "q-1");

beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
});

afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
});

describe("draftKey", () => {
    it("elemenként külön kulcsot ad, a create-nek pedig sajátot", () => {
        /* Ha két elem ugyanazt a kulcsot kapná, az egyik piszkozata felülírná a
           másikat — a felhasználó egy IDEGEN szöveget kapna vissza. */
        expect(draftKey("quotes", "q-1")).not.toBe(draftKey("quotes", "q-2"));
        expect(draftKey("quotes", null)).not.toBe(draftKey("quotes", "q-1"));
        // A szekciók sem üthetik egymást.
        expect(draftKey("quotes", null)).not.toBe(draftKey("to-dos", null));
    });
});

describe("saveDraft + readDraft", () => {
    it("a mentett piszkozat visszaolvasható, a mentés IDEJÉVEL együtt", () => {
        saveDraft(KEY, {quote: "Félbehagyott idézet", order: 2});

        const draft = readDraft(KEY, schema);

        expect(draft?.payload).toEqual({quote: "Félbehagyott idézet", order: 2});
        // Az időpont a felajánláshoz kell ("mikori ez a szöveg?").
        expect(draft?.savedAt.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it("nincs bejegyzés → nincs piszkozat", () => {
        expect(readDraft(KEY, schema)).toBeNull();
    });

    it("a törlés után nincs piszkozat", () => {
        saveDraft(KEY, {quote: "Akármi", order: 1});

        clearDraft(KEY);

        expect(readDraft(KEY, schema)).toBeNull();
    });

    it("NEM a mi alakunk (kézzel átírt vagy régi verzió) → nincs piszkozat, és takarítunk", () => {
        localStorage.setItem(KEY, "{ez nem json");

        expect(readDraft(KEY, schema)).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("a MAI alakhoz nem illő tartalmat eldobja (nem tölt vissza hiányos űrlapot)", () => {
        /* Ez az az eset, amikor egy szekció mezői időközben megváltoztak. Egy
           hiányos visszatöltés rosszabb, mint a semmi: a felhasználó azt hinné,
           megvan a szövege, közben fele hiányzik. */
        saveDraft(KEY, {quote: "Van szöveg, de nincs sorszám"});

        expect(readDraft(KEY, schema)).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("EGY HÓNAPNÁL régebbi piszkozatot eldob, és törli", () => {
        /* Nem valódi várakozás: az órát tekerjük. A véges korlát azért kell, hogy
           egy évekig ott felejtett piszkozat ne maradjon a tárolóban — de a korlát
           BŐSÉGES: a piszkozat egy elmaradt mentés pótlása, és attól még a
           felhasználó szövege, hogy hetekig nem nyitotta meg. */
        vi.useFakeTimers();
        saveDraft(KEY, {quote: "Nagyon régi", order: 1});
        vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000 + 1000);

        expect(readDraft(KEY, schema)).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("HÁROM HETEST viszont megtart (kontroll a lejárathoz)", () => {
        /* A kontroll SZÁNDÉKOSAN jóval a korlát alatt, de a KORÁBBI (egy hetes)
           korláton TÚL van: így ez a teszt megbukik, ha valaki visszaviszi a
           lejáratot egy hétre — a puszta "30 napnál régebbi elévül" állítás ezt
           nem venné észre. */
        vi.useFakeTimers();
        saveDraft(KEY, {quote: "Három hete írtam", order: 1});
        vi.advanceTimersByTime(21 * 24 * 60 * 60 * 1000);

        expect(readDraft(KEY, schema)?.payload).toEqual({quote: "Három hete írtam", order: 1});
    });

    it("a BASE-t is megőrzi (ehhez képest dől el, ütközik-e a piszkozat)", () => {
        saveDraft(KEY, {quote: "Mentetlen", order: 2}, {quote: "Amit a szerver adott", order: 1});

        const draft = readDraft(KEY, schema);

        expect(draft?.base).toEqual({quote: "Amit a szerver adott", order: 1});
    });

    it("BASE NÉLKÜL is olvasható (create-piszkozat, régi bejegyzés): base = null", () => {
        /* Create-nél nincs mihez képest — nincs is mit felülírni. A hívó ebből
           tudja, hogy ütközés-vizsgálat nélkül kell döntenie. */
        saveDraft(KEY, {quote: "Új elem", order: 1});

        expect(readDraft(KEY, schema)?.base).toBeNull();
    });

    it("ha a tároló ÍRÁSA elszáll, az app nem borul fel", () => {
        /* A localStorage dobhat: tele a kvóta, privát ablak, letiltott tárolás.
           Ez a mentés végső vésztartaléka — ha ő sem megy, akkor sincs mit tenni,
           de a felhasználó munkamenetét nem viheti magával. */
        const setItem = vi.spyOn(Storage.prototype, "setItem")
            .mockImplementation(() => { throw new Error("QuotaExceededError"); });

        expect(() => saveDraft(KEY, {quote: "Akármi", order: 1})).not.toThrow();

        setItem.mockRestore();
    });

    it("ha a tároló OLVASÁSA elszáll, nincs piszkozat (nem dob)", () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem")
            .mockImplementation(() => { throw new Error("SecurityError"); });

        expect(readDraft(KEY, schema)).toBeNull();

        getItem.mockRestore();
    });
});
