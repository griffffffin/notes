/* TÖRZS-VALIDÁCIÓ BEKÖTVE — minden szekció create/update-je, a FELÉPÜLT routerből.

   Minden írás, ami a kliens TÖRZSÉT a tárba engedi (create, update), előbb
   validálja azt (validateTodoBody / validateQuoteBody). Ma ez szekciónként KÉZZEL
   van bekötve a routes.js-ben. A veszély, amit ez a kapu zár: egy JÖVŐBELI szekció
   create/update-je, ami elfelejti a törzs-validátort, ellenőrizetlen adatot
   engedne a tárba (és onnan az exportba) — némán.

   ⚠ EZ NEM ADATSZIVÁRGÁS (szemben a readerScope/serialize/ownership kapukkal),
   hanem adat-INTEGRITÁS: kisebb súlyú, de ugyanaz a néma-kihagyás minta, és ugyanaz
   a derived megoldás illik rá.

   HOGYAN ISMERJÜK FEL a törzs-validátort GENERIKUSAN. Egy közös szonda nem tudja
   megmondani egy tetszőleges middleware-ről, hogy „ez törzset validál" — a
   validátorok szekció-specifikusak. Ezért a validátor ÖNMAGÁT jelöli meg
   (`validatesBody = true`), pontosan úgy, ahogy a modell az `exportName`-jével
   nyilatkozik. A kapu csak a jelölőt keresi, konkrét validátort nem ismer — így
   marad DERIVED: egy új szekció validátorának is meg kell jelölnie magát, és ha
   elmarad, ez a kapu HANGOSAN jelez.

   A minta a serializeBoundary.test.js-é (közös router-szonda): a szekció-lista az
   exportName-ből származik, a láncot a FELÉPÜLT routerből olvassuk, és MUTÁCIÓ-
   PRÓBA van beépítve — a törzs NÉLKÜLI végpontok (/delete csak id-t, /last/order
   olvas) láncában a jelölő NEM lehet ott, különben a detektor konstans-igaz. */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";

const {isModelFile} = require("../scripts/exportSections");
const {sectionRouter, chainHas} = require("./test/routerProbe");
const routes = require("./routes");

const MODELS_DIR = path.join(__dirname, "models");
const sections = fs.readdirSync(MODELS_DIR).filter(isModelFile).sort()
    .map((file) => require(path.join(MODELS_DIR, file)))
    .filter((model) => typeof model.exportName === "string" && model.exportName.trim() !== "")
    .map((model) => model.exportName);

/* A kliens-törzset a tárba engedő írás-műveletek. A /delete SZÁNDÉKOSAN kimarad:
   az csak az id-t kapja (nincs mit törzsben validálni) — épp ezért jó KONTROLL. */
const BODY_WRITES = ["create", "update"];
/* Törzs NÉLKÜLI végpontok — a jelölő itt NEM lehet jelen (a detektor diszkriminál). */
const NON_BODY_OPS = ["delete", "last/order"];

// Van-e a `/<op>` láncában törzs-validátornak JELÖLT réteg?
const chainHasBodyValidator = (subRouter, op) =>
    chainHas(subRouter, op, (handle) => handle.validatesBody === true);

describe("törzs-validáció bekötve: minden szekció create/update-je (derived)", () => {
    /* KONTROLL a néma üres-hurok ellen. */
    it("van legalább két szekció (különben a kapu üresen zöldülne)", () => {
        assert.ok(sections.length >= 2, `csak ${sections.length} szekciót találtam: ${sections.join(", ")}`);
    });

    for (const section of sections) {
        const subRouter = sectionRouter(routes, section);

        for (const op of BODY_WRITES) {
            it(`/${section}/${op} törzs-validátor mögött van`, () => {
                assert.ok(chainHasBodyValidator(subRouter, op),
                    `A /${section}/${op} láncában nincs törzs-validátornak jelölt middleware — ` +
                    "ellenőrizetlen adat juthat a tárba. Köss be egy törzs-validátort, és jelöld meg " +
                    "(fn.validatesBody = true), l. middleware/validateTodo.js.");
            });
        }

        /* MUTÁCIÓ-PRÓBA: a törzs nélküli végpontok láncában NINCS jelölő — ez
           bizonyítja, hogy a „megvan" nem konstans-igaz. */
        for (const op of NON_BODY_OPS) {
            it(`/${section}/${op} láncában NINCS törzs-validátor (a detektor diszkriminál)`, () => {
                assert.ok(!chainHasBodyValidator(subRouter, op),
                    `A /${section}/${op} láncában törzs-validátor-jelölőt találtam, pedig annak nincs ` +
                    "törzse — a detektor mindenre igazat ad, tehát a fenti állítások értéktelenek.");
            });
        }
    }
});
