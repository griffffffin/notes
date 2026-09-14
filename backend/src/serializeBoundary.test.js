/* SORSZÁM-MŰVELETEK SOROSÍTVA — minden szekció, a FELÉPÜLT routerből (derived).

   A sorszám-mozgató végpontok (create/update/delete/reorder) párja NEM atomi:
   told el a szomszédokat, majd írd az elemet — tranzakció nincs (l. userLock.js).
   Két párhuzamos kérés így egymásba fűzheti a feleit, és a lista NÉMÁN elromlik.
   A védelem a `serializePerUser` middleware: fiókonként egymás után futtatja a
   műveleteket. Ma mind a nyolc írás-route-on (to-do ÉS idézet) ott van, KÉZZEL
   bekötve.

   A veszély, amit ez a kapu zár: egy JÖVŐBELI szekció (film, jegyzet…) írás-
   route-ja, ami elfelejti a `serializePerUser`-t, azonnal versenyezhető lesz — és
   a hiba néma: a végpont működik, csak ritka párhuzamosságnál keveri a
   sorszámokat. A viselkedés-teszt ezt gyakorlatilag nem tudja reprodukálni (valódi
   DB + időzített párhuzamosság kellene); a bekötés MEGLÉTÉT viszont a felépült
   routerből ki lehet olvasni.

   A minta az authBoundary.test.js-é: nem a forrás SZÖVEGÉT olvassuk (az formázás-
   függő és némán kihagy), hanem a MÁR FELÉPÜLT routert kérdezzük — a
   `serializePerUser` réteget AZONOSSÁG szerint keressük (`handle === serializePerUser`,
   ugyanaz a modulpéldány a Node-gyorsítótárból). A szekció-lista a modellek
   `exportName`-jéből SZÁRMAZIK (az az URL-szegmens, l. itemQuota.test.js), tehát
   egy új szekció AUTOMATIKUSAN fedve van.

   MUTÁCIÓ-PRÓBA BEÉPÍTVE: egy szerializálást NEM igénylő végpont (`/last/order`,
   tiszta olvasás) láncában a detektor NEM találhatja meg a middleware-t — ez
   bizonyítja, hogy a "megvan" nem konstans-igaz. Ha valaki egy írás-route-ról
   kiveszi a `serializePerUser`-t, az adott op tesztje pirosra vált. */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";

const {isModelFile} = require("../scripts/exportSections");
const {sectionRouter, chainHas} = require("./test/routerProbe");
const routes = require("./routes");
/* UGYANAZ a modulpéldány, amit a routes.js is használ — az azonosság-vizsgálat
   (`handle === serializePerUser`) csak így működik (Node modul-gyorsítótár). */
const {serializePerUser} = require("./userLock");

const MODELS_DIR = path.join(__dirname, "models");
const sections = fs.readdirSync(MODELS_DIR).filter(isModelFile).sort()
    .map((file) => require(path.join(MODELS_DIR, file)))
    .filter((model) => typeof model.exportName === "string" && model.exportName.trim() !== "")
    .map((model) => model.exportName);

/* A sorszám-mozgató (tehát sorosítandó) írás-műveletek. Ez a NÉGY az, amit a
   userLock.js is felsorol; a per-elem olvasások (/id, /edit) és a listák nem
   mozgatnak sorszámot, azoknak nincs mit sorosítani. */
const ORDERED_WRITES = ["create", "update", "delete", "reorder"];

/* KONTROLL-VÉGPONT: tiszta olvasás, sorszám-mozgatás nélkül — a detektor itt NEM
   találhat serializePerUser-t. Mindkét szekcióban létező route, hogy a kontroll
   is derived maradjon. */
const NON_SERIALIZED_OP = "last/order";

/* Ott van-e a serializePerUser a `/<op>` láncában? AZONOSSÁG szerint. A
   router-szonda a közös test/routerProbe.js-ből jön (a serializeBoundary és a
   validationBoundary is ezt használja). */
const chainHasSerialize = (subRouter, op) =>
    chainHas(subRouter, op, (handle) => handle === serializePerUser);

describe("sorszám-műveletek sorosítva: minden szekció, minden írás (derived)", () => {
    /* KONTROLL a néma üres-hurok ellen: ha az exportName-felderítés elromlik, a
       lenti hurok üresen futna, és zölden jelentene semmit. */
    it("van legalább két szekció (különben a kapu üresen zöldülne)", () => {
        assert.ok(sections.length >= 2, `csak ${sections.length} szekciót találtam: ${sections.join(", ")}`);
    });

    for (const section of sections) {
        const subRouter = sectionRouter(routes, section);

        for (const op of ORDERED_WRITES) {
            it(`/${section}/${op} a serializePerUser mögött van`, () => {
                assert.ok(chainHasSerialize(subRouter, op),
                    `A /${section}/${op} nincs serializePerUser-rel bekötve — a párhuzamos kérések ` +
                    "némán összekeverhetik a sorszámokat (l. userLock.js). Tedd a láncba, a requireOwnership ELÉ.");
            });
        }

        /* MUTÁCIÓ-PRÓBA: a tiszta olvasás NINCS sorosítva — ha itt is "megvan",
           a detektor konstans-igaz, és semmit nem bizonyít fentebb. */
        it(`/${section}/${NON_SERIALIZED_OP} (olvasás) NINCS sorosítva (a detektor diszkriminál)`, () => {
            assert.ok(!chainHasSerialize(subRouter, NON_SERIALIZED_OP),
                `A /${section}/${NON_SERIALIZED_OP} láncában serializePerUser-t találtam, pedig az tiszta ` +
                "olvasás — a detektor mindenre igazat ad, tehát a fenti állítások értéktelenek.");
        });
    }
});
