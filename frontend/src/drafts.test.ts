import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import * as v from "valibot";
import {clearDraft, draftKey, readDraft, readDraftItemId, saveDraft} from "./drafts";
import {clearDraftKey, isEncryptedDraft, setDraftKey} from "./draftCrypto";
import {giveDraftKey} from "./test/draftKey";

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
    /* A piszkozat MA TITKOSÍTVA íródik ki, tehát kulcs nélkül meg sem születne.
       A kulcs-nélküli állapotnak külön blokkja van lentebb — az a viselkedés
       ugyanolyan fontos, mint a titkosítás maga. */
    giveDraftKey();
});

afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    clearDraftKey();
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

    it("EGY HÉTNÉL régebbi piszkozatot eldob, és törli", () => {
        /* Nem valódi várakozás: az órát tekerjük. A korlát a user döntése
           (2026-08-20, korábban egy hónap): a piszkozat egy elmaradt mentés
           pótlása, nem archívum — és egy hétnél tovább a Safari sem tartja meg a
           script-ből írt tárolót, ha közben nem használják az oldalt. */
        vi.useFakeTimers();
        saveDraft(KEY, {quote: "Nagyon régi", order: 1});
        vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1000);

        expect(readDraft(KEY, schema)).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("HAT NAPOSAT viszont megtart (kontroll a lejárathoz)", () => {
        /* A kontroll a korlát ALATT, de közel hozzá: így a teszt akkor is megbukik,
           ha valaki a lejáratot lejjebb viszi (pl. egy napra) — a puszta "egy
           hétnél régebbi elévül" állítás azt nem venné észre. */
        vi.useFakeTimers();
        saveDraft(KEY, {quote: "Hat napja írtam", order: 1});
        vi.advanceTimersByTime(6 * 24 * 60 * 60 * 1000);

        expect(readDraft(KEY, schema)?.payload).toEqual({quote: "Hat napja írtam", order: 1});
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

/* AMI A LEMEZRE KERÜL — ez az egész titkosítás értelme.

   A piszkozat a felhasználó gépén, a böngésző profilkönyvtárában fekvő fájlba
   kerül. Amíg nyílt szöveg volt, addig egy másik OS-fiók vagy egy ellopott lemez
   simán elolvasta. Ezek a tesztek azt kérik számon, hogy ott már ne legyen mit
   elolvasni. */
describe("a tárolóba írt érték", () => {
    it("TITKOSÍTVA fekszik ott — a beírt szöveg nem olvasható ki belőle", () => {
        saveDraft(KEY, {quote: "A bankkartyam PIN kodja 1234", order: 1});

        const stored = localStorage.getItem(KEY);
        expect(stored).not.toBeNull();
        expect(isEncryptedDraft(stored ?? "")).toBe(true);
        expect(stored).not.toContain("bankkartyam");
        // A base64 nem titkosítás: dekódolva sem lehet ott a szöveg.
        expect(atob(stored?.split(".")[2] ?? "")).not.toContain("bankkartyam");
    });

    it("UGYANAZ a piszkozat kétszer mentve KÜLÖNBÖZŐ tárolt értéket ad (friss IV)", () => {
        /* Ha két mentés azonos értéket adna, az azt jelentené, hogy az IV nem
           változik — a GCM-nél az IV újrahasználata a hitelesítő kulcsot is
           kiszivárogtatja, nem csak a két üzenetet rontja el. */
        saveDraft(KEY, {quote: "Ugyanaz", order: 1});
        const first = localStorage.getItem(KEY);
        saveDraft(KEY, {quote: "Ugyanaz", order: 1});

        expect(localStorage.getItem(KEY)).not.toBe(first);
    });

    it("a MÁS KULCCSAL titkosított piszkozatot nem adja vissza, és takarít", () => {
        /* Élesben: másik fiók maradéka, vagy a szerveren újragenerált kulcs. A
           tartalom visszafejthetetlen, tehát nincs mit felajánlani — és mivel ez
           a bejegyzés soha többé nem lesz olvasható, a helye sem indokolt. */
        saveDraft(KEY, {quote: "Idegen szöveg", order: 1});
        const foreign = localStorage.getItem(KEY);
        clearDraftKey();
        giveDraftKey();
        localStorage.setItem(KEY, foreign ?? "");
        // Ugyanaz a kulcs — cseréljük ki egy MÁSIKRA.
        setDraftKey(btoa(String.fromCharCode(...new Uint8Array(32).fill(8))));

        expect(readDraft(KEY, schema)).toBeNull();
        expect(localStorage.getItem(KEY)).toBeNull();
    });
});

/* KULCS NÉLKÜL — a szabály: inkább NINCS piszkozat, mint nyílt szövegű.

   Ez az állapot valóságos: a lap újratöltése után a memóriában tartott kulcs
   eltűnik, és a szervertől való visszakérése egy kérésnyi időbe telik; ha pedig
   a hálózat nem megy, akkor egyáltalán nem érkezik meg. */
describe("kulcs nélkül", () => {
    beforeEach(() => {
        clearDraftKey();
    });

    it("NEM ír piszkozatot (nyílt szöveget soha)", () => {
        saveDraft(KEY, {quote: "Ezt nem szabad kiírni", order: 1});

        expect(localStorage.getItem(KEY)).toBeNull();
    });

    it("a MEGLÉVŐ piszkozatot nem adja vissza, de NEM is törli", () => {
        /* A kulcs hiánya átmeneti állapot is lehet (még nem érkezett meg). Aki
           ilyenkor takarítana, a mentetlen munkát dobná ki azért, mert épp nem
           tudja elolvasni. */
        giveDraftKey();
        saveDraft(KEY, {quote: "Megvan, csak most nem olvasható", order: 1});
        const stored = localStorage.getItem(KEY);
        clearDraftKey();

        expect(readDraft(KEY, schema)).toBeNull();
        expect(readDraftItemId(KEY)).toBeNull();
        expect(localStorage.getItem(KEY)).toBe(stored);

        // És ha a kulcs mégis megjön, a piszkozat ott van, épen.
        giveDraftKey();
        expect(readDraft(KEY, schema)?.payload).toEqual({quote: "Megvan, csak most nem olvasható", order: 1});
    });
});

/* ÁTÁLLÁS A RÉGI, TITKOSÍTATLAN PISZKOZATRÓL.

   A titkosítás bevezetése előtt írt piszkozatok ott fekszenek a felhasználók
   gépén. Eldobni őket adatvesztés volna (a bennük álló szöveg SEHOL máshol nem
   létezik), ezért elolvassuk — és rögtön újra is írjuk, immár titkosítva. */
describe("régi, titkosítatlan piszkozat", () => {
    // Pontosan az az alak, amit a titkosítás ELŐTTI kód írt ki.
    const legacy = () => localStorage.setItem(KEY, JSON.stringify({
        savedAt: Date.now(),
        payload: {quote: "A titkosítás előtt írtam", order: 4},
        itemId: "507f1f77bcf86cd799439011",
    }));

    it("még olvasható", () => {
        legacy();

        expect(readDraft(KEY, schema)?.payload).toEqual({quote: "A titkosítás előtt írtam", order: 4});
    });

    it("olvasás után már TITKOSÍTVA fekszik a tárolóban", () => {
        legacy();

        readDraft(KEY, schema);

        const stored = localStorage.getItem(KEY);
        expect(isEncryptedDraft(stored ?? "")).toBe(true);
        expect(stored).not.toContain("titkosítás előtt");
        // És attól még ugyanaz olvasható ki belőle.
        expect(readDraft(KEY, schema)?.payload).toEqual({quote: "A titkosítás előtt írtam", order: 4});
    });

    it("kulcs nélkül is olvasható marad, és a helyén marad", () => {
        /* Itt a nyílt szöveg MÁR a lemezen van — nem mi írnánk oda. A választás
           tehát nem "titkosítunk vagy sem", hanem "visszaadjuk a munkáját vagy
           eldobjuk". */
        legacy();
        clearDraftKey();

        expect(readDraft(KEY, schema)?.payload).toEqual({quote: "A titkosítás előtt írtam", order: 4});
        expect(localStorage.getItem(KEY)).not.toBeNull();
    });

    it("az azonosítója is előkerül (a create-belépőnek)", () => {
        legacy();

        expect(readDraftItemId(KEY)).toBe("507f1f77bcf86cd799439011");
    });
});

/* A CSAK-AZONOSÍTÓ OLVASÓ — és ami megkülönbözteti a readDraft-tól.

   A létrehozás belépője (components/routes.tsx) csak azt kérdezi: van-e függő
   create, és milyen azonosítóval? Nem ismeri az adott szekció mezőit, tehát a
   readDraft-ot nem hívhatja: az a TARTALMAT is ellenőrizné a kapott sémával, és
   ha nem illik rá, ELDOBNÁ a bejegyzést — a felhasználó mentetlen szövegét. */
describe("readDraftItemId", () => {
    it("visszaadja a burokban őrzött azonosítót", () => {
        saveDraft(KEY, {quote: "Szöveg", order: 1}, undefined, "507f1f77bcf86cd799439011");

        expect(readDraftItemId(KEY)).toBe("507f1f77bcf86cd799439011");
    });

    it("null, ha nincs piszkozat vagy nincs benne azonosító", () => {
        expect(readDraftItemId(KEY)).toBeNull();
        saveDraft(KEY, {quote: "Azonosító nélkül", order: 1});
        expect(readDraftItemId(KEY)).toBeNull();
    });

    it("lejárt piszkozat azonosítóját nem adja vissza", () => {
        vi.useFakeTimers();
        saveDraft(KEY, {quote: "Régi", order: 1}, undefined, "507f1f77bcf86cd799439011");
        vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000 + 1000);

        expect(readDraftItemId(KEY)).toBeNull();
    });

    it("NEM TÖRLI a piszkozatot, akkor sem, ha a tartalma ismeretlen alakú", () => {
        /* EZ A LÉNYEG. A belépő nem ismeri a tartalom sémáját; ha ez a függvény
           takarítana, egy nem várt alakú (de tökéletesen érvényes) piszkozatot
           némán kitörölne — és a felhasználó szövege azzal együtt veszne. */
        localStorage.setItem(KEY, JSON.stringify({
            savedAt: Date.now(),
            itemId: "507f1f77bcf86cd799439011",
            payload: {teljesen: "más alak"},
        }));

        expect(readDraftItemId(KEY)).toBe("507f1f77bcf86cd799439011");
        expect(localStorage.getItem(KEY)).not.toBeNull();
    });
});
