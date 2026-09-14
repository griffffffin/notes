/* FIÓKONKÉNTI ELEM-KVÓTA — három szinten őrizve.

   (1) DEKLARÁCIÓ-GATE: minden modell nyilatkozik a kvótájáról (mint az
       exportName-nél) — a tartalmi szekció pozitív egészet, a nem-tartalmi (users)
       null-t. A nyilatkozat nélküli modell HIBA, commitnál. Új szekció nem
       maradhat ki némán.
   (2) MIDDLEWARE-VISELKEDÉS: az enforceItemQuota alatt/fölött/határon a helyeset
       teszi (next / 403 / idempotens átengedés), és kvóta nélküli modellre
       induláskor elszáll.
   (3) WIRING: minden SZEKCIÓ create-je tényleg kvóta-őrzött — a végpont-lista a
       modellek exportName-jéből SZÁRMAZIK (az az URL-szegmens), tehát egy jövőbeli
       szekció create-je AUTOMATIKUSAN fedve lesz: ha valaki elfelejti bekötni az
       őrt, ez a teszt bukik. */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const {isModelFile} = require("../scripts/exportSections");
const enforceItemQuota = require("./middleware/enforceItemQuota");
const {userStub, sessionCookieFor} = require("./test/authStub");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";

/* A modell-mappa bejárása — UGYANAZZAL a szűrővel, amit a napi export használ
   (isModelFile), hogy a "mi számít modellnek" ne két, csendben elcsúszó
   másolatban éljen. */
const MODELS_DIR = path.join(__dirname, "models");
const modelEntries = fs.readdirSync(MODELS_DIR).filter(isModelFile).sort()
    .map((file) => [file, require(path.join(MODELS_DIR, file))]);

/* A nyilatkozat értelmezése — külön (fs-mentes) függvény, hogy kitalált
   modellekkel is meg tudjuk szólítani (kontroll). A tartalmi szekciót az
   exportName jelöli (a napi export is ezzel dönt): string = szekció, ezért
   pozitív egész kvótát kell adnia; a nem-tartalmi (exportName null) kvótája null. */
function validateQuotaDeclaration(file, model) {
    if (!Object.hasOwn(model, "itemQuota"))
        throw new Error(`${file}: nincs itemQuota-nyilatkozat. Írd a modell mellé: ` +
            "Model.itemQuota = <pozitív egész> (tartalmi szekció) vagy null (nem felhasználói tartalom).");
    const quota = model.itemQuota;
    const isSection = typeof model.exportName === "string" && model.exportName.trim() !== "";
    if (isSection) {
        if (!Number.isInteger(quota) || quota <= 0)
            throw new Error(`${file}: exportName="${model.exportName}" tartalmi szekció, tehát az ` +
                `itemQuota pozitív egész (fiókonkénti elemkorlát). Kaptam: ${JSON.stringify(quota)}.`);
    } else if (quota !== null) {
        throw new Error(`${file}: nem tartalmi szekció (exportName nem szöveg), tehát az itemQuota ` +
            `null. Kaptam: ${JSON.stringify(quota)}.`);
    }
}

describe("elem-kvóta: minden modell nyilatkozik (deklaráció-gate)", () => {
    /* KONTROLL: ha a bejárás elromlik, a gate üres listán futna, és zölden
       jelentene semmit. */
    it("a modell-mappa bejárása talál modelleket (különben a gate némán semmit sem őrizne)", () => {
        assert.ok(modelEntries.length >= 2, `csak ${modelEntries.length} modellt találtam`);
    });

    for (const [file, model] of modelEntries) {
        it(`${file} érvényes itemQuota-t deklarál`, () => {
            assert.doesNotThrow(() => validateQuotaDeclaration(file, model));
        });
    }

    /* KONTROLLOK: a validátor tényleg FOG — különben a fenti "átmegy" semmit sem
       bizonyítana. */
    it("tartalmi szekció itemQuota nélkül → HIBA", () => {
        assert.throws(() => validateQuotaDeclaration("fake.js", {exportName: "fakes"}));
    });
    it("tartalmi szekció null kvótával → HIBA", () => {
        assert.throws(() => validateQuotaDeclaration("fake.js", {exportName: "fakes", itemQuota: null}));
    });
    it("tartalmi szekció 0 vagy negatív kvótával → HIBA", () => {
        assert.throws(() => validateQuotaDeclaration("fake.js", {exportName: "fakes", itemQuota: 0}));
        assert.throws(() => validateQuotaDeclaration("fake.js", {exportName: "fakes", itemQuota: -5}));
    });
    it("nem-tartalmi modell numerikus kvótával → HIBA", () => {
        assert.throws(() => validateQuotaDeclaration("fake.js", {exportName: null, itemQuota: 100}));
    });
    it("helyes szekció-nyilatkozat átmegy", () => {
        assert.doesNotThrow(() => validateQuotaDeclaration("fake.js", {exportName: "fakes", itemQuota: 500000}));
    });
});

/* Egy kitalált modell a middleware közvetlen (unit) vizsgálatához: a
   countDocuments/exists válaszát mi szabjuk meg. */
function fakeModel({count, exists, quota = 500000, name = "Fake"}) {
    return {
        modelName: name,
        itemQuota: quota,
        countDocuments: async () => count,
        exists: async () => exists,
    };
}

/* A middleware lefuttatása kitalált req/res-szel; visszaadja, mi történt. */
async function runGuard(model, {id = "507f1f77bcf86cd799439011", userId = "u1"} = {}) {
    const request = {userId, body: {id}};
    const result = {status: null, body: null, nexted: false};
    const response = {
        status(code) { result.status = code; return this; },
        json(payload) { result.body = payload; return this; },
    };
    await enforceItemQuota(model)(request, response, () => { result.nexted = true; });
    return result;
}

describe("elem-kvóta: a middleware viselkedése", () => {
    it("a kvóta ALATT átenged (next)", async () => {
        const result = await runGuard(fakeModel({count: 10, exists: null}));
        assert.strictEqual(result.nexted, true);
        assert.strictEqual(result.status, null);
    });

    it("a kvótán, ÚJ elemre 403-at ad (nem enged létrehozni)", async () => {
        const result = await runGuard(fakeModel({count: 500000, exists: null}));
        assert.strictEqual(result.nexted, false);
        assert.strictEqual(result.status, 403);
    });

    it("a kvótán, IDEMPOTENS ismétlésre (létező saját id) átenged", async () => {
        /* A már létező elem újbóli create-je nem hoz létre újat — a határon is
           átmehet, különben egy elveszett-válaszú create újrapróbája elbukna. */
        const result = await runGuard(fakeModel({count: 500000, exists: {_id: "x"}}));
        assert.strictEqual(result.nexted, true);
        assert.strictEqual(result.status, null);
    });

    it("DB-hibára 500-at ad (nem enged tovább, nem 403)", async () => {
        const brokenModel = {
            modelName: "Broken", itemQuota: 500000,
            countDocuments: async () => { throw new Error("DB le van esve"); },
            exists: async () => null,
        };
        const result = await runGuard(brokenModel);
        assert.strictEqual(result.nexted, false);
        assert.strictEqual(result.status, 500);
    });

    it("kvóta nélküli modell bekötésére INDULÁSKOR elszáll (hangos, nem néma)", () => {
        assert.throws(() => enforceItemQuota({modelName: "NoQuota", itemQuota: undefined}));
        assert.throws(() => enforceItemQuota({modelName: "NullQuota", itemQuota: null}));
        assert.throws(() => enforceItemQuota({modelName: "ZeroQuota", itemQuota: 0}));
    });
});

/* A WIRING vizsgálatához a valódi routert szólítjuk meg (mint a
   writeRateLimit.test.js): auth-megkerülés stubbal, DB nélkül. */
mongoose.set("bufferTimeoutMS", 50);
const Users = require("./models/users");
Users.findById = async (id) => userStub(id);
const routes = require("./routes");

const app = express();
app.use(express.json());
app.use(routes);

/* A SZEKCIÓ-modellek a nyilatkozataikból: exportName = az URL-szegmens (todos.js),
   tehát a create-útvonal `/${exportName}/create`. Így a lista MAGÁTÓL bővül egy új
   szekcióval — nincs kézzel karbantartott végpont-felsorolás. */
const sectionModels = modelEntries
    .map(([, model]) => model)
    .filter((model) => typeof model.exportName === "string" && model.exportName.trim() !== "");

describe("elem-kvóta: minden szekció create-je kvóta-őrzött (wiring, auto-felderítve)", () => {
    it("van legalább egy szekció-modell (különben a wiring-teszt üresen zöldülne)", () => {
        assert.ok(sectionModels.length >= 2, `csak ${sectionModels.length} szekció-modellt találtam`);
    });

    for (const model of sectionModels) {
        const createPath = `/${model.exportName}/create`;
        it(`${createPath} 403-at ad, ha a fiók elérte a kvótát`, async () => {
            /* A modell számláló/létezés-lekérdezését ideiglenesen a "kvótán,
               nem-idempotens" állapotba állítjuk. Ha a create nincs
               enforceItemQuota-val bekötve, a kérés a body-validátoron akad el
               (400), nem 403-on — épp ezt fogja meg a teszt. */
            const originalCount = model.countDocuments;
            const originalExists = model.exists;
            model.countDocuments = async () => model.itemQuota;
            model.exists = async () => null;
            try {
                const response = await request(app).post(createPath)
                    .set("Cookie", sessionCookieFor("507f1f77bcf86cd799439011"))
                    .send({id: "507f1f77bcf86cd7994390aa"});
                assert.strictEqual(response.status, 403,
                    `${createPath} nem 403-at adott a kvótán (hanem ${response.status}) — ` +
                    "a create nincs enforceItemQuota-val bekötve?");
            } finally {
                model.countDocuments = originalCount;
                model.exists = originalExists;
            }
        });
    }
});
