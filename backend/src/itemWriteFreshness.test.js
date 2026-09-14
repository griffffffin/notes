/* ITEM-ÍRÁS FRISSESSÉGE — az updatedAt egyetlen írás-útból sem maradhat ki.

   Minden szekció-elem módosítása (update, reorder) KÉT némán elromló dolgot kell
   betartson: (1) futtassa a séma-validátorokat (a findByIdAndUpdate alapból nem),
   és (2) bumpolja az updatedAt-et — a napi export ebből dönti el, volt-e aznapi
   változás, tehát egy elfelejtett bump NÉMÁN kihagyná az elemet a mentésből
   (l. scripts/exportSections.js, models/timestamps.test.js).

   Ezt ma a writeContract.test.js MÉRI végpontonként — de a szekció-listája KÉZI
   (l. [[manual-fixture-lists-backlog]]): egy új szekció, amit elfelejtenek felvenni,
   őrizetlen marad. Ez a fájl a HIÁNYZÓ, DERIVED felét adja hozzá — két rétegben:

     (1) A writeItem (ordering.js) EGY helyre teszi az updatedAt-et és a
         runValidators-t. Unit-teszt bizonyítja, hogy MINDIG mindkettőt megteszi.
     (2) FORRÁS-SZKEN (derived, szekció-lista NÉLKÜL): egyetlen controller sem hív
         NYERS update-write-ot (findByIdAndUpdate/findOneAndUpdate/updateOne/
         updateMany) — az item-írás a writeItem-en megy. Így egy JÖVŐBELI szekció
         update/reorder-je, ami nyers findByIdAndUpdate-tel kerülné meg a helpert
         (és felejtené el az updatedAt-et), AUTOMATIKUSAN megbukik. A kettő együtt:
         minden item-írás a writeItem-en át megy, az pedig garantáltan bumpol.

   A forrás-szken önmaga is némán elromolhat (l. [[source-scanning-guards-two-shapes]]):
   ezért az osztályozó TISZTA függvény, mutáció-próbával, és külön kontroll követeli
   meg, hogy az allowlistelt (Users) írásokat TÉNYLEG megtalálja — ha a regex
   elromlik, az bukik, nem a sweep zöldül üresen. */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {writeItem} = require("./ordering");

const CONTROLLERS_DIR = path.join(__dirname, "controllers");

/* Az elem-módosító (updatedAt-igénylő) írás-metódusok. A findByIdAndDelete
   SZÁNDÉKOSAN kimarad: a törlés után nincs mit frissíteni. */
const UPDATE_WRITE =
    /\.\s*(?:findByIdAndUpdate|findOneAndUpdate|updateOne|updateMany)\s*\(/;

/* Ki írhat NYERSEN, a writeItem megkerülésével — és miért. A Users nem exportált
   szekció (exportName null, l. models/users.js): nincs updatedAt-je, nincs napi
   exportja, tehát az identitás-írásainak (jelszó-áthashelés, tokenVersion-léptetés)
   nincs mit bumpolniuk. Bővíteni csak indokkal (mint a readerScope allowlistje). */
const ALLOWED_RAW_UPDATE = {
    "Users/login.js": "Users identitás-írás (jelszó-áthashelés) — nem exportált szekció, nincs updatedAt.",
    "Users/logout.js": "Users identitás-írás (tokenVersion-léptetés, globális kiléptetés) — nincs updatedAt.",
};

/* Tiszta függvény (se fs, se hálózat), hogy kitalált forrásokkal is meg tudjuk
   szólítani (mutáció-próba). */
function rawUpdateVerdict(relPath, source) {
    const hasRawUpdate = UPDATE_WRITE.test(source);
    const allowlisted = Object.hasOwn(ALLOWED_RAW_UPDATE, relPath);
    return {hasRawUpdate, allowlisted, violation: hasRawUpdate && !allowlisted};
}

function controllerFiles(directory = CONTROLLERS_DIR) {
    const out = [];
    for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) out.push(...controllerFiles(full));
        else if (/\.[jt]s$/.test(entry.name) && !/\.test\.[jt]s$/.test(entry.name)) out.push(full);
    }
    return out;
}

const relKey = (full) => path.relative(CONTROLLERS_DIR, full).split(path.sep).join("/");

describe("item-írás: a writeItem mindig bumpol + validál (unit)", () => {
    function capturingModel() {
        const calls = [];
        return {
            calls,
            findByIdAndUpdate(id, payload, options) { calls.push({id, payload, options}); return Promise.resolve(); },
        };
    }

    it("az updatedAt-et Date-ként állítja be (a mostani időre)", async () => {
        const model = capturingModel();
        const before = Date.now();
        await writeItem(model, "id1", {title: "x", order: 3});
        const {payload} = model.calls[0];
        assert.strictEqual(payload.title, "x", "az átadott mezők megmaradnak");
        assert.strictEqual(payload.order, 3);
        assert.ok(payload.updatedAt instanceof Date, "az updatedAt Date");
        assert.ok(payload.updatedAt.getTime() >= before, "az updatedAt a mostani írás ideje");
    });

    it("futtatja a séma-validátorokat (runValidators: true)", async () => {
        const model = capturingModel();
        await writeItem(model, "id1", {order: 3});
        assert.strictEqual(model.calls[0].options?.runValidators, true);
    });

    it("a megadott id-ra ír", async () => {
        const model = capturingModel();
        await writeItem(model, "abc", {order: 1});
        assert.strictEqual(model.calls[0].id, "abc");
    });
});

describe("item-írás frissessége: nincs nyers update-write a controllerekben (derived)", () => {
    const scanned = controllerFiles().sort().map((full) => {
        const relPath = relKey(full);
        return {relPath, ...rawUpdateVerdict(relPath, fs.readFileSync(full, "utf8"))};
    });

    it("nincs writeItem-et megkerülő nyers update-write (allowlistelten kívül)", () => {
        const offenders = scanned.filter((file) => file.violation).map((file) => file.relPath);
        assert.deepStrictEqual(offenders, [],
            "Egy controller nyers update-write-ot hív (findByIdAndUpdate/findOneAndUpdate/updateOne/updateMany) a " +
            "writeItem helyett — így elfelejtheti az updatedAt-et, és a napi export némán kihagyná a módosítást. " +
            `Vidd a writeItem-en (ordering.js), vagy ha indokolt (nem exportált szekció), vedd fel az ` +
            `ALLOWED_RAW_UPDATE listába. Vétkes(ek): ${offenders.join(", ")}`);
    });

    /* KONTROLL a néma üres-szken ellen ÉS az elavult allowlist ellen: minden
       allowlistelt bejegyzésnek TÉNYLEG nyers update-write-ot kell hívnia. Ha a
       regex elromlik (semmit sem talál), ez bukik — nem a sweep zöldül üresen. */
    it("az allowlist minden bejegyzése tényleg nyers update-writer (regex él, lista nem elavult)", () => {
        for (const relPath of Object.keys(ALLOWED_RAW_UPDATE)) {
            const file = scanned.find((entry) => entry.relPath === relPath);
            assert.ok(file, `az allowlist "${relPath}"-ra hivatkozik, de ilyen controller nincs — elavult?`);
            assert.ok(file.hasRawUpdate,
                `az allowlist "${relPath}"-ot ment, de az nem hív nyers update-write-ot — fölösleges bejegyzés, ` +
                "vagy a felismerő regex elromlott.");
        }
    });
});

describe("item-írás frissessége: az osztályozó diszkriminál (kontroll)", () => {
    it("nyers findByIdAndUpdate, nem allowlistelt → VÉTSÉG", () => {
        assert.strictEqual(rawUpdateVerdict("Fake/update.js", "Model.findByIdAndUpdate(id, {})").violation, true);
        assert.strictEqual(rawUpdateVerdict("Fake/x.js", "Model.updateMany({}, {})").violation, true);
    });
    it("writeItem-en át → NEM vétség (nincs nyers write)", () => {
        assert.strictEqual(rawUpdateVerdict("Fake/update.js", "writeItem(Model, id, {order})").hasRawUpdate, false);
    });
    it("allowlistelt nyers write → NEM vétség", () => {
        assert.strictEqual(rawUpdateVerdict("Users/login.js", "Users.updateOne({_id}, {})").violation, false);
    });
    it("a findByIdAndDelete (törlés) NEM update-write", () => {
        assert.strictEqual(rawUpdateVerdict("Fake/delete.js", "Model.findByIdAndDelete(id)").hasRawUpdate, false);
    });
});
