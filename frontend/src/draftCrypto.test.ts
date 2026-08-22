import {beforeEach, describe, expect, it} from "vitest";
import {clearDraftKey, decryptDraft, encryptDraft, hasDraftKey, isEncryptedDraft,
    setDraftKey} from "./draftCrypto";

/* A PISZKOZAT-TITKOSÍTÁS tesztjei.

   A kriptográfia tesztelése különös műfaj: a "működik" itt nem elég, mert a
   hibás titkosítás is tökéletesen működőnek LÁTSZIK — visszafejt, nem hibázik,
   a felhasználó semmit nem vesz észre. Ezért nem azt vizsgáljuk elsősorban, hogy
   a kör bezárul-e, hanem a HÁROM klasszikus buktatót:

     1. a kulcs csak a memóriában él, és ha nincs, akkor NINCS titkosítás sem
        (soha nem esünk vissza nyílt szövegre);
     2. minden titkosítás FRISS IV-t kap (a GCM-nél az IV ismétlődése nem csak a
        két üzenetet rontja el, hanem a hitelesítő kulcsot is kiszivárogtatja);
     3. a hitelesítő címke ellenőrzése nincs kihagyva — a megpiszkált érték DOB,
        nem ad vissza szemetet.

   És egy negyedik, ami az egésznek az ÉRTELME: a titkos szövegben ne legyen ott
   olvashatóan az, amit beírtunk. Ez az egyetlen állítás, amit a felhasználó
   számonkérne rajtunk. */

// 32 bájt (AES-256), base64-ben — ugyanabban az alakban, ahogy a szervertől jön.
const KEY = btoa(String.fromCharCode(...new Uint8Array(32).map((_, index) => index * 7 % 256)));
const OTHER_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

beforeEach(() => {
    clearDraftKey();
});

describe("a kulcs kezelése", () => {
    it("kulcs nélkül NEM titkosít és NEM fejt vissza — inkább nincs piszkozat", () => {
        expect(hasDraftKey()).toBe(false);
        /* A dobás itt a védelem. Ha kulcs híján némán nyílt szöveget írnánk a
           lemezre, az pontosan az a "vészmegoldás", ami ellen az egész modul van. */
        expect(() => encryptDraft("titok")).toThrow(/kulcs/);
        expect(() => decryptDraft("aesgcm1.AAAA.BBBB")).toThrow(/kulcs/);
    });

    it("a kijelentkezés eldobja a kulcsot", () => {
        setDraftKey(KEY);
        expect(hasDraftKey()).toBe(true);

        clearDraftKey();

        expect(hasDraftKey()).toBe(false);
        expect(() => encryptDraft("titok")).toThrow(/kulcs/);
    });

    it("hibás hosszú kulcsot NEM vesz át", () => {
        /* 16 bájt: önmagában érvényes AES-kulcs volna (AES-128), de nem az, amit
           a szerver ad — ha ilyet kapunk, valami elcsúszott, és jobb hangosan
           elhasalni, mint fél védelmet nyújtani. */
        expect(() => setDraftKey(btoa(String.fromCharCode(...new Uint8Array(16))))).toThrow(/bájt/);
        expect(hasDraftKey()).toBe(false);
    });
});

/* A TÁROLT ÉRTÉK FELISMERÉSE — nem biztonsági kérdés, hanem MEGKÜLÖNBÖZTETÉS.

   A localStorage-ban ott lehet még a titkosítás bevezetése ELŐTTI, nyílt szövegű
   piszkozat is. Azt nem visszafejteni kell, hanem elolvasni és titkosítva
   újraírni (drafts.ts) — enélkül a felhasználó mentetlen munkája veszne el az
   átállás miatt. */
describe("a tárolt érték felismerése", () => {
    it("a SAJÁT formátumát felismeri, a régi, titkosítatlan piszkozatot nem", () => {
        setDraftKey(KEY);

        expect(isEncryptedDraft(encryptDraft("akármi"))).toBe(true);
        // A titkosítás előtti alak: sima JSON.
        expect(isEncryptedDraft('{"savedAt":1,"payload":{}}')).toBe(false);
        expect(isEncryptedDraft("")).toBe(false);
    });
});

describe("titkosítás és visszafejtés", () => {
    beforeEach(() => setDraftKey(KEY));

    it("a titkosított szöveg visszafejtve ugyanaz", () => {
        const text = JSON.stringify({quote: "Félbehagyott idézet", order: 2});

        expect(decryptDraft(encryptDraft(text))).toBe(text);
    });

    it("a titkos szövegben NINCS benne olvashatóan a piszkozat", () => {
        /* Ez a modul létezésének oka, egyetlen állításban. A base64 nem
           titkosítás: ha a tartalom csak kódolva lenne, ez a teszt buktatná.

           A PRÓBASZÖVEG SZÁNDÉKOSAN ÉKEZET NÉLKÜLI. Mutáció-próbával mérve: a
           titkosítást puszta base64-re cserélve ez a teszt ÉKEZETES szöveggel
           ZÖLD maradt — mert az `atob` a UTF-8 bájtokat latin-1-ként adja vissza
           ("bankkartyam" helyett "bankkÃ¡rtyam"), tehát a keresett szó akkor sem
           szerepel benne, ha a tartalom valójában olvasható. Az ASCII szöveg
           ezt a rést zárja be. */
        const envelope = encryptDraft("A bankkartyam PIN kodja 1234");

        expect(envelope).not.toContain("bankkartyam");
        expect(atob(envelope.split(".")[2] ?? "")).not.toContain("bankkartyam");
    });

    it("UGYANAZ a szöveg kétszer titkosítva KÜLÖNBÖZŐ IV-t és titkos szöveget ad", () => {
        const [, firstIv, firstText] = encryptDraft("ugyanaz").split(".");
        const [, secondIv, secondText] = encryptDraft("ugyanaz").split(".");

        expect(firstIv).not.toBe(secondIv);
        /* A titkos szöveg eltérése a KÖVETKEZMÉNYE az eltérő IV-nek — ha egyszer
           mégis egyeznének, az azt jelentené, hogy az IV valójában nem került
           bele a számításba (pl. valaki fix IV-t drótozott be). */
        expect(firstText).not.toBe(secondText);
    });

    it("a MEGPISZKÁLT titkos szöveg DOB, nem ad vissza szemetet", () => {
        const [format, iv, ciphertext] = encryptDraft("eredeti szöveg").split(".");
        const bytes = Uint8Array.from(atob(ciphertext ?? ""), (character) => character.charCodeAt(0));
        // Egyetlen bit átbillentése — a GCM hitelesítő címkéjének ennyit kell észrevennie.
        bytes[0] = (bytes[0] ?? 0) ^ 1;
        const tampered = [format, iv, btoa(String.fromCharCode(...bytes))].join(".");

        expect(() => decryptDraft(tampered)).toThrow();
    });

    it("a kicserélt IV is DOB", () => {
        const [format, , ciphertext] = encryptDraft("eredeti szöveg").split(".");
        const otherIv = btoa(String.fromCharCode(...new Uint8Array(12).fill(1)));

        expect(() => decryptDraft([format, otherIv, ciphertext].join("."))).toThrow();
    });

    it("MÁSIK kulccsal nem fejthető vissza", () => {
        /* Élesben ez az az eset, amikor a szerveren új kulcs született (vagy a
           piszkozat egy másik fiókból maradt ott): a tartalom nem a mienk, tehát
           nem is szabad visszaadni. */
        const envelope = encryptDraft("a másik fiók szövege");

        setDraftKey(OTHER_KEY);

        expect(() => decryptDraft(envelope)).toThrow();
    });

    it("idegen alakú tárolt értéket NEM próbál visszafejteni", () => {
        // A régi, TITKOSÍTATLAN piszkozat (JSON) és a formátum-jelölés nélküli szemét.
        expect(() => decryptDraft('{"savedAt":1,"payload":{}}')).toThrow(/formátum/);
        expect(() => decryptDraft("aesgcm2.AAAA.BBBB")).toThrow(/formátum/);
        expect(() => decryptDraft("aesgcm1.AAAA")).toThrow(/formátum/);
    });

    it("a HOSSZÚ piszkozat is épen fordul meg (200 kB)", () => {
        /* A `String.fromCharCode(...bytes)` alak ekkora tömbnél `RangeError`-ral
           elszállna (minden bájt külön argumentum) — a darabolás nélkül tehát
           pont a hosszú jegyzet piszkozata veszne el, némán. */
        const long = "á".repeat(100 * 1024);

        expect(decryptDraft(encryptDraft(long))).toBe(long);
    });
});
