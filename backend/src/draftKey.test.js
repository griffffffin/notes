/* A PISZKOZAT-KULCS ÉLETE: egyszer születik, azután VÁLTOZATLAN.

   MIÉRT ÉR EZ KÜLÖN TESZTET. Mert a kulcs elvesztése NÉMA adatvesztés. Ha egy
   második kérés új kulcsot generálna a régi helyett, semmi nem hibázna: a
   végpont ugyanúgy 200-at ad, a kliens ugyanúgy titkosít — csak a LEMEZEN már
   fekvő piszkozatok válnának örökre olvashatatlanná, és épp akkor derülne ki,
   amikor a felhasználónak a legnagyobb szüksége lenne rájuk (elbukott mentés
   után). Ezért a "ne generálj újat" nem optimalizálás, hanem a funkció lényege.

   A HAMIS MODELL A VALÓSÁGOT TÜKRÖZI, nem a szelektorainkat: egyetlen dokumentum
   egyetlen módosítása OSZTHATATLAN, tehát a szűrő ("akinek még nincs kulcsa") a
   párhuzamos kérések közül pontosan egyet enged át. Ezt a hamis modell a
   kritikus szakasz megszakítás-mentességével mintázza, a hívások ELŐTT viszont
   szándékosan enged futni másokat (`setImmediate`) — így a kérések tényleg
   egymásba lapolnak, ahogy a hálózaton is.

   ÉS AZ ATOMISSÁG NEM FELTEVÉS MARAD: élesben, a Pi FerretDB-jén is lemérve —
   három párhuzamos kulcs-kérés, három azonos kulcs, egyetlen írás (l. a menet
   jegyzőkönyvét). A hamis modell tehát nem "jóhiszemű", hanem a mért viselkedést
   írja le. */
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const USER_ID = "507f1f77bcf86cd799439011";

/* A KULCSHOSSZ ITT KIÍRVA, NEM A MODULBÓL VÉVE. Először a modul `KEY_BYTES`-ához
   hasonlítottam a kulcs hosszát — az viszont ÖNMAGÁRA vizsgált: 16-ra rontva a
   teszt zöld maradt (mutáció-próbával mérve). Az AES-256 kulcsa 32 bájt, ez a
   szabvány rögzíti; a modul értéke ehhez a számhoz kötött, nem fordítva. */
const AES_256_KEY_BYTES = 32;

/* A HAMIS FELHASZNÁLÓ-MODELL. Csak azt a két műveletet ismeri, amit a
   draftKey.js használ — és a `{draftKey: null}` szűrőt úgy értelmezi, ahogy a
   MongoDB: a HIÁNYZÓ mezőre is illeszkedik. */
const store = new Map();
let writes = 0;

// A hálózat-szerű késleltetés: enged futni más, épp várakozó kéréseket. Enélkül
// a párhuzamossági teszt nem érne semmit (minden hívás végigfutna egyben).
const yieldToOthers = () => new Promise((resolve) => setImmediate(resolve));

const Users = {
    async findOneAndUpdate(filter, update, options) {
        await yieldToOthers();
        // Innentől NINCS `await`: ezt a szakaszt az adatbázis oszthatatlanul végzi el.
        assert.deepStrictEqual(Object.keys(filter).sort(), ["_id", "draftKey"],
            "A draftKey.js szűrője megváltozott. Ha az új alakot ez a hamis modell nem " +
            "értelmezi, a teszt attól kezdve nem azt vizsgálja, amit hiszünk.");
        assert.strictEqual(filter.draftKey, null,
            "A szűrő már nem a KULCS NÉLKÜLI fiókra szűkít — vezesd át ezt a tesztet is.");
        const document = store.get(String(filter._id));
        if (!document) return null;
        // MongoDB-szemantika: a `{mező: null}` a hiányzó mezőre IS illeszkedik.
        if (document.draftKey !== undefined && document.draftKey !== null) return null;
        Object.assign(document, update.$set);
        writes++;
        return options?.new ? {...document} : {...document, draftKey: undefined};
    },
    async findById(id) {
        await yieldToOthers();
        const document = store.get(String(id));
        return document ? {...document} : null;
    },
};

const modelPath = require.resolve("./models/users");
require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true, path: path.dirname(modelPath), exports: Users,
};

const {getOrCreateDraftKey, KEY_BYTES} = require("./draftKey");

test.beforeEach(() => {
    store.clear();
    // A fiók a jelszó-hashsel EGYÜTT: a végpont-teszt épp azt nézi, hogy ez nem megy ki.
    store.set(USER_ID, {_id: USER_ID, name: "teszt", password: "$2b$11$hamis-hash"});
    writes = 0;
});

test("kulcs nélküli fiók kap egy 32 bájtos, véletlen kulcsot", async () => {
    const key = await getOrCreateDraftKey(USER_ID);

    assert.strictEqual(typeof key, "string");
    assert.strictEqual(KEY_BYTES, AES_256_KEY_BYTES,
        "A modul kulcshossza már nem az AES-256-é. A kliens oldali visszafejtés pontosan " +
        "32 bájtot vár (draftCrypto.ts) — rövidebb kulcsot el sem fogad.");
    assert.strictEqual(Buffer.from(key, "base64").length, AES_256_KEY_BYTES,
        "A kulcs nem 32 bájt — az AES-256 pontosan ennyit kíván (l. draftCrypto.ts).");
    assert.strictEqual(store.get(USER_ID).draftKey, key, "A kulcs nem került be a fiókba.");
});

test("két hívás UGYANAZT a kulcsot adja — a második nem generál újat", async () => {
    const first = await getOrCreateDraftKey(USER_ID);
    const second = await getOrCreateDraftKey(USER_ID);

    assert.strictEqual(second, first,
        "A második kérés más kulcsot adott. Élesben ez azt jelentené, hogy a lemezen már " +
        "fekvő piszkozatok visszafejthetetlenné válnak — némán, hibaüzenet nélkül.");
    assert.strictEqual(writes, 1, "A kulcsot egynél többször írtuk be.");
});

test("két KÜLÖN fiók külön kulcsot kap", async () => {
    const other = "507f1f77bcf86cd799439012";
    store.set(other, {_id: other, name: "masik", password: "$2b$11$hamis-hash"});

    const mine = await getOrCreateDraftKey(USER_ID);
    const theirs = await getOrCreateDraftKey(other);

    assert.notStrictEqual(mine, theirs);
});

/* A VERSENY. Ez az a teszt, ami a "olvasd ki, és ha nincs, írd be" alakot
   megbuktatja: ott a három kérés mind kulcs NÉLKÜL találná a fiókot (mindegyik
   az olvasásnál várakozna), és mind a három írna — az utolsó nyerne. */
test("három párhuzamos kérés ugyanazt a kulcsot kapja, egyetlen írásból", async () => {
    const keys = await Promise.all([
        getOrCreateDraftKey(USER_ID),
        getOrCreateDraftKey(USER_ID),
        getOrCreateDraftKey(USER_ID),
    ]);

    assert.strictEqual(new Set(keys).size, 1,
        `A párhuzamos kérések eltérő kulcsot kaptak (${keys.join(", ")}). Az egyik lap ` +
        "piszkozatait a másik lap kulcsa írná felül.");
    assert.strictEqual(writes, 1, `A kulcsot ${writes}-szor írtuk be, pedig egyszer kellett volna.`);
});

test("eltűnt fiókra HIBÁT dob, nem ad üres kulcsot", async () => {
    store.clear();

    await assert.rejects(() => getOrCreateDraftKey(USER_ID), /piszkozat-kulcs/,
        "Kulcs híján a hívónak hibát kell kapnia. Egy `undefined` kulcsból a kliens " +
        "titkosítás nélkül menthetne — nyílt szöveget pedig SOHA nem írunk a lemezre.");
});

/* A VÉGPONT SZERZŐDÉSE: a válasz CSAK a kulcs, semmi más a fiókból. */
test("a végpont válasza a puszta kulcs — a fiók többi mezője nem megy ki", async () => {
    const express = require("express");
    const request = require("supertest");
    const keyRoute = require("./controllers/Drafts/key");

    const app = express();
    app.use(express.json());
    // Az auth middleware helyett közvetlenül adjuk a tokenből jövő azonosítót:
    // ennek a tesztnek nem a hitelesítés a tárgya (azt az authBoundary.test.js őrzi).
    app.use((request_, _response, next) => { request_.userId = USER_ID; next(); });
    app.use("/drafts/key", keyRoute);

    const response = await request(app).post("/drafts/key").send({});

    assert.strictEqual(response.status, 200);
    assert.strictEqual(typeof response.body, "string",
        "A válasz nem puszta szöveg. A frontend sémája (types/api.ts) stringet vár — " +
        "burkolóra váltva a kulcs némán nem érkezne meg, és nem lenne piszkozat.");
    assert.strictEqual(response.body, store.get(USER_ID).draftKey);
    assert.ok(!JSON.stringify(response.body).includes("hamis-hash"),
        "A válaszban ott a jelszó-hash! A végpont a teljes dokumentumot adta ki.");
});
