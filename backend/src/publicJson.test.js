/* A KIFELÉ MENŐ DOKUMENTUM-VÁLASZOK WHITELISTJE — a szekció-modellek toJSON-ja.

   Ez egy NÉMA szivárgást őriz. A lista- és a szerkesztő-betöltő végpontok a
   Mongoose-dokumentumot `response.json(doc)`-kal küldik ki; ha a séma nem
   szűkítené a JSON-t, a tulajdonos azonosítója (`user`), a séma-verzió (`__v`) és
   az időbélyegek is a dróton mennének — sőt egy jövőbeli új mező is, magától.
   Semmi nem hibázna: a végpont működne, a lista megjelenne, a felesleges mezők
   csak ott ülnének a válaszban.

   A doksit HIDRATÁLJUK (Model.hydrate), mert ez tükrözi a DB-ből betöltött alakot:
   a `__v` és az időbélyegek is jelen vannak rajta — épp az a helyzet, amit a
   végpont szerializál. Új, mentetlen doksin a `__v` nem is lenne rajta, tehát a
   teszt hamis zöldet adhatna.

   A LEGERŐSEBB ÁLLÍTÁS a kulcs-halmaz PONTOS egyezése: nem azt nézzük, hogy egy-két
   ismert mező hiányzik (blacklist-gondolkodás), hanem hogy KIZÁRÓLAG a whitelist
   megy ki. Így egy jövőbeli séma-mező, ami nincs a whitelistben, azonnal buktatja a
   tesztet — nem csendben szivárog. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const mongoose = require("mongoose");
const {isModelFile} = require("../scripts/exportSections");
const Quotes = require("./models/quotes");
const Todos = require("./models/todos");

const ID = new mongoose.Types.ObjectId();
const USER = "507f1f77bcf86cd799439011";

test("a Quotes toJSON KIZÁRÓLAG a hálózatra szánt mezőket adja", () => {
    const json = Quotes.hydrate({
        _id: ID, user: USER, quote: "Idézet", author: "Szerző", order: 3, fontSize: 155,
        __v: 7, createdAt: new Date(), updatedAt: new Date(),
    }).toJSON();

    assert.deepStrictEqual(Object.keys(json).sort(),
        ["_id", "author", "fontSize", "order", "quote"],
        "a Quotes válasza más mezőt is kiadott, mint a whitelist");
    assert.strictEqual(json.user, undefined, "a tulajdonos azonosítója nem mehet ki");
    assert.strictEqual(json.__v, undefined, "a séma-verzió nem mehet ki");
    assert.strictEqual(json.createdAt, undefined, "az időbélyeg nem mehet ki");
    assert.strictEqual(json.updatedAt, undefined);
});

test("a Todos toJSON KIZÁRÓLAG a hálózatra szánt mezőket adja", () => {
    /* A tasks NEM üres: a Mongoose `type: Object` üres `{}`-t nem szerializál, így
       egy üres fixtúrával a whitelist tasks-ágát nem is mérnénk. Valós alsorral
       viszont a mezőnek meg KELL jelennie a válaszban. */
    const json = Todos.hydrate({
        _id: ID, user: USER, title: "Cím", category: "otthon", color: "danger",
        percentage: 0, order: 2, tasks: {"0": {id: "0", content: "Tej", done: false}}, taskOrder: [0],
        __v: 4, createdAt: new Date(), updatedAt: new Date(),
    }).toJSON();

    assert.deepStrictEqual(Object.keys(json).sort(),
        ["_id", "category", "color", "order", "percentage", "taskOrder", "tasks", "title"],
        "a Todos válasza más mezőt is kiadott, mint a whitelist");
    assert.strictEqual(json.user, undefined, "a tulajdonos azonosítója nem mehet ki");
    assert.strictEqual(json.__v, undefined, "a séma-verzió nem mehet ki");
    assert.strictEqual(json.createdAt, undefined, "az időbélyeg nem mehet ki");
    assert.strictEqual(json.updatedAt, undefined);
});

/* A whitelist a MEGLÉVŐ mezőket viszont KIADJA: a fenti tesztek "kizárólag"
   állítása üresen is teljesülne (ha semmit nem adna ki), ezért itt külön
   ellenőrizzük, hogy a hálózatra szánt értékek tényleg átjutnak — ez a whitelist
   kontrollja, hogy nem egy mindent-eldobó transzformációt mérünk. */
test("a whitelistelt mezők ÉRTÉKE átjut (nem mindent dobunk el)", () => {
    const json = Quotes.hydrate({
        _id: ID, user: USER, quote: "Idézet", author: "Szerző", order: 3, fontSize: 155,
    }).toJSON();
    assert.strictEqual(json.quote, "Idézet");
    assert.strictEqual(json.author, "Szerző");
    assert.strictEqual(json.order, 3);
    assert.strictEqual(json.fontSize, 155);
    assert.strictEqual(String(json._id), String(ID));
});

/* DERIVED GATE — MINDEN szekció, nem csak a fenti kettő.

   A fenti tesztek a Quotes és a Todos PONTOS whitelistjét rögzítik (a legerősebb
   állítás), de kézzel: egy JÖVŐBELI szekció, ami elfelejt `toJSON`-whitelistet
   adni, kimaradna belőlük, és a `response.json(doc)` a TULAJDONOST a dróton adná
   ki — némán. Ez a gate a szekció-modelleket a nyilatkozatukból (exportName = az
   URL-szegmens, l. itemQuota.test.js) fésüli át, tehát egy új szekció AUTOMATIKUSAN
   fedve van.

   MIT NÉZ: a `user` (tulajdonos → bérlő-szivárgás) és a `__v` (belső verzió) SOHA
   nem mehet ki — ezek univerzálisan tiltottak, szekciótól függetlenül. Az
   időbélyegeket SZÁNDÉKOSAN nem tiltjuk hard-ra: egy jövőbeli szekció akarhat
   „hozzáadás dátuma" mezőt; a PONTOS whitelistet szekciónként a saját (kézi)
   tesztje rögzíti, mint fent. */
const MODELS_DIR = path.join(__dirname, "models");
const sectionModels = fs.readdirSync(MODELS_DIR).filter(isModelFile).sort()
    .map((file) => [file, require(path.join(MODELS_DIR, file))])
    .filter(([, model]) => typeof model.exportName === "string" && model.exportName.trim() !== "");

const FORBIDDEN_IN_RESPONSE = ["user", "__v"];

test("van legalább egy szekció-modell (különben a derived gate üresen zöldülne)", () => {
    assert.ok(sectionModels.length >= 2, `csak ${sectionModels.length} szekció-modellt találtam`);
});

for (const [file, Model] of sectionModels) {
    test(`${file}: a toJSON nem szivárogtatja a tulajdonost és a verziót (derived)`, () => {
        /* Hidratálunk (mint a DB-ből betöltött alak): a `user`, `__v` és az
           időbélyegek rajta ülnek a doksin — épp az, amit a végpont szerializálna. */
        const json = Model.hydrate({
            _id: new mongoose.Types.ObjectId(), user: "LEAK-ME",
            __v: 9, createdAt: new Date(), updatedAt: new Date(),
        }).toJSON();

        for (const field of FORBIDDEN_IN_RESPONSE)
            assert.strictEqual(json[field], undefined,
                `${file}: a "${field}" kiment a toJSON-ból — hiányzik a whitelist ` +
                "(publicJsonTransform, l. todos.js)? A response.json(doc) így a " +
                "tulajdonost/verziót a dróton adná ki, némán.");
    });
}

/* KONTROLL: a fenti "undefined" állítások üresen is teljesülnének, ha a hidratálás
   vagy a toJSON elromlana. Egy whitelist NÉLKÜLI séma toJSON-ja KIADJA a
   tulajdonost — ezt itt bizonyítjuk, hogy a gate nem vak. */
test("kontroll: whitelist NÉLKÜLI séma toJSON-ja tényleg kiadná a tulajdonost", () => {
    const bareSchema = new mongoose.Schema({user: String, title: String});
    const Bare = mongoose.model("BareLeakControl", bareSchema);
    const json = Bare.hydrate({_id: new mongoose.Types.ObjectId(), user: "LEAK-ME"}).toJSON();
    assert.strictEqual(json.user, "LEAK-ME",
        "a kontroll-modell nem szivárogtatott — a derived gate vak lehet");
});
