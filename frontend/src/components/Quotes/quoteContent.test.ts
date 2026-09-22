import {describe, expect, it, vi} from "vitest";

/* LOOPBACK KÖR-MÉRÉS a VALÓDI titkosítással — a terv záró lépése (E2EE.md 10.,
   e2ee-implementation-plan). A read.test.tsx és a save.test.tsx MOCKOLJA a
   quoteContentet (hogy a szerkesztő-/lista-tesztet ne terhelje a kriptó); ITT viszont
   a VALÓDI encryptQuote/decryptQuote fut, a valódi e2ee/content + aead réteggel. Ez
   bizonyítja a teljes kört: a szerkesztő borítéka a szerverre kerülne, onnan
   visszaolvasva a kliens PONTOSAN ugyanazt a tartalmat fejti vissza.

   A MESTERKULCS FORRÁSÁT fixáljuk (getMasterKey), hogy ne kelljen a lassú Argon2id-t
   futtatni — a mérés tárgya a tartalom-titkosítás köre, nem a kulcs-származtatás (azt a
   masterKeySession/masterKey tesztjei fedik). A titkosítás maga VALÓDI. */
const MASTER_KEY = new Uint8Array(32).map((_, index) => (index * 7 + 3) % 256);
vi.mock(import("../../masterKeySession"), () => ({getMasterKey: () => MASTER_KEY}));

const {encryptQuote, decryptQuote} = await import("./quoteContent");

const ID = "507f1f77bcf86cd799439011";
/* Szándékosan „nehéz" tartalom: félkövér-marker, sortörés, ékezet, nem-alap betűméret. */
const CONTENT = {
    quote: "Az **élet** szép.\nÚj sorban is.", author: "Márai Sándor", fontSize: 170,
    createdAt: "2026-01-01T12:34:56.000Z",
};

describe("quoteContent — loopback kör-mérés (valódi titkosítással)", () => {
    it("titkosít → (tárolt boríték) → visszafejt: UGYANAZ a tartalom", () => {
        const ciphertext = encryptQuote(ID, CONTENT);
        expect(decryptQuote(ID, ciphertext)).toEqual(CONTENT);
    });

    it("a névtelen (szerző nélküli) idézet is körbejár", () => {
        const anonymous = {quote: "Névtelen bölcsesség.", fontSize: 155,
            createdAt: "2026-02-02T00:00:00.000Z"};
        const ciphertext = encryptQuote(ID, anonymous);
        expect(decryptQuote(ID, ciphertext)).toEqual(anonymous);
    });

    it("a boríték NEM tartalmazza olvashatóan a tartalmat", () => {
        const ciphertext = encryptQuote(ID, CONTENT);
        // A titkos rész base64-je visszafejtve (bájtok) sem tartalmazza a nyílt szöveget.
        const secret = atob(ciphertext.split(".")[2] ?? "");
        expect(secret).not.toContain("Márai");
        expect(secret).not.toContain("élet");
    });

    it("MÁSIK elem (_id) alá téve a visszafejtés DOB (helyhez-kötés, AAD)", () => {
        /* Az ellenséges szerver nem teheti egy elem borítékát egy MÁSIK elem helyére:
           az AAD (section|_id) nem egyezik, a GCM-címke bukik (l. content.ts). */
        const ciphertext = encryptQuote(ID, CONTENT);
        expect(() => decryptQuote("507f1f77bcf86cd799439012", ciphertext)).toThrow();
    });

    it("megbuherált boríték visszafejtése DOB (a hívó ebből tud hibakártyát adni)", () => {
        const ciphertext = encryptQuote(ID, CONTENT);
        /* A titkos rész (base64) ELSŐ karakterének billentése egy bájtot megváltoztat
           → a GCM-hitelesítés elhasal. (A base64 UTOLSÓ karaktere padding-biteket is
           hordozhat, aminek a cseréje azonos bájtot adhat — ezért az elejét rontjuk.) */
        const parts = ciphertext.split(".");
        const secret = parts[2] ?? "";
        parts[2] = (secret[0] === "A" ? "B" : "A") + secret.slice(1);
        expect(() => decryptQuote(ID, parts.join("."))).toThrow();
    });
});
