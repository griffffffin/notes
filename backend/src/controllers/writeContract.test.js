/* AZ ÍRÁS-VÉGPONTOK SZERZŐDÉSE — három szabály, amit MINDEN szekciónak be kell
   tartania, és amelyek megszegése NÉMA: a végpont nem hibázik, a felület
   működni látszik, csak az eredmény rossz.

     (1) A tulajdonos a TOKENBŐL jön. A kérés törzsében küldött `user` mezőt a
         szerver figyelmen kívül hagyja. Ez a régi alkalmazás fő gyengesége
         volt: hitt a kliensnek. Ha valaha visszaszivárogna a body-ból olvasás,
         semmi nem jelezné — a saját böngészőnk sosem küld hamis user-t.
     (2) A módosítás FUTTATJA a séma-validátorokat. A Mongoose a
         findByIdAndUpdate-nél alapból NEM teszi (nem tölti be a dokumentumot,
         csak parancsot küld), tehát a `runValidators: true` elhagyásával a
         módosítás megkerülné a required-eket, amiket a létrehozás betart.
     (3) A módosítás FRISSÍTI az updatedAt-et. A napi export ebből dönti el,
         volt-e aznap változás; egy elfelejtett időbélyeg egy egész napot
         kihagyatna a mentésből (l. models/timestamps.test.js a séma-oldalról).

   A modelleket memóriabeli mockra cseréljük (mint az ordering.test.js), és a
   mentett dokumentumot, illetve a findByIdAndUpdate argumentumait rögzítjük —
   adatbázis nem kell. A két szekció ugyanazokat az állításokat kapja: egy
   jövőbeli szekció felvételekor a SECTIONS-be írt egyetlen sor elég. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const request = require("supertest");

process.env.JWT_SECRET = "teszt-titok-csak-a-teszthez";

const newId = () => new mongoose.Types.ObjectId().toString();
const OWNER = newId();
const STRANGER = newId();

// Amit a controllerek mentettek, illetve módosítottak — a tesztek ezt vizsgálják.
const saved = [];
const updates = [];

/* Egy szekció mockolt modellje. Konstruktor, mert a create `new Model(...).save()`-t
   hív; a többi metódus statikus rajta, ahogy a Mongoose-modelleknél is. */
function mockModel(existing) {
    function Model(data) { Object.assign(this, data); }
    Model.findById = (id) => Promise.resolve(String(id) === existing._id ? existing : null);
    Model.findByIdAndDelete = () => Promise.resolve(existing);
    Model.findByIdAndUpdate = (id, payload, options) => {
        updates.push({id, payload, options});
        return Promise.resolve(existing);
    };
    Model.updateMany = () => Promise.resolve({});
    Model.find = () => ({sort: () => ({limit: () => Promise.resolve([existing])})});
    Model.prototype.save = function () { saved.push({...this}); return Promise.resolve(); };
    return Model;
}

/* A két szekció: a mockolt modell útvonala, egy meglévő elem, és a KÉT kérés-törzs
   (létrehozás/módosítás), amit a controllerek várnak. A törzsekben SZÁNDÉKOSAN
   ott a hamis `user` — épp azt vizsgáljuk, hogy a szerver eldobja-e. */
const SECTIONS = [
    {
        name: "to-do",
        modelPath: require.resolve("../models/todos"),
        existing: {_id: newId(), user: OWNER, title: "Lista", order: 5},
        createBody: {user: STRANGER, title: "Új", category: "otthon", color: "warning",
            order: 1, tasks: {}, taskOrder: []},
    },
    {
        name: "idézet",
        modelPath: require.resolve("../models/quotes"),
        existing: {_id: newId(), user: OWNER, quote: "Idézet", order: 5},
        createBody: {user: STRANGER, quote: "Új idézet", author: "Szerző", order: 1},
    },
];

const userModelPath = require.resolve("../models/users");
require.cache[userModelPath] = {
    id: userModelPath, filename: userModelPath, loaded: true,
    exports: {findById: async (id) => String(id) === OWNER ? {_id: id, name: "teszt"} : null},
};

for (const section of SECTIONS) {
    const Model = mockModel(section.existing);
    require.cache[section.modelPath] = {
        id: section.modelPath, filename: section.modelPath, loaded: true, exports: Model,
    };
}

// A controllereket a mockok BEÁLLÍTÁSA UTÁN töltjük be — így a mockolt modellt látják.
const auth = require("../middleware/auth");
const controllers = {
    "to-do": {
        create: require("./Todos/create"),
        update: require("./Todos/update"),
        reorder: require("./Todos/reorder"),
    },
    "idézet": {
        create: require("./Quotes/create"),
        update: require("./Quotes/update"),
        reorder: require("./Quotes/reorder"),
    },
};

const apps = {};
for (const section of SECTIONS) {
    const app = express();
    app.use(express.json());
    app.use(auth);
    app.use("/create", controllers[section.name].create);
    app.use("/update", controllers[section.name].update);
    app.use("/reorder", controllers[section.name].reorder);
    apps[section.name] = app;
}

const token = "Bearer " + jwt.sign({id: OWNER}, process.env.JWT_SECRET, {expiresIn: "7d"});
const post = (section, path, body) =>
    request(apps[section.name]).post(path).set("Authorization", token).send(body);

test.beforeEach(() => { saved.length = 0; updates.length = 0; });

for (const section of SECTIONS) {
    // A módosítás törzse: a létrehozáséval azonos mezők + a szerkesztett elem id-ja.
    const updateBody = () => ({...section.createBody, id: section.existing._id});

    test(`${section.name} — létrehozás: a törzsben küldött user-t ELDOBJA, a tokenét menti`, async () => {
        await post(section, "/create", section.createBody);

        assert.strictEqual(saved.length, 1);
        assert.strictEqual(saved[0].user, OWNER, "a mentett tulajdonos a TOKENÉ");
        assert.notStrictEqual(saved[0].user, STRANGER);
    });

    test(`${section.name} — módosítás: a törzsben küldött user NEM írja át a tulajdonost`, async () => {
        await post(section, "/update", updateBody());

        assert.strictEqual(updates.length, 1);
        // A user mező meg sem jelenhet a módosításban: a tulajdonos nem átírható.
        assert.strictEqual(updates[0].payload.user, undefined);
    });

    test(`${section.name} — módosítás: futtatja a séma-validátorokat`, async () => {
        await post(section, "/update", updateBody());

        assert.strictEqual(updates[0].options?.runValidators, true);
    });

    test(`${section.name} — módosítás: FRISSÍTI az updatedAt-et (a napi export erre épül)`, async () => {
        const before = Date.now();

        await post(section, "/update", updateBody());

        const {updatedAt} = updates[0].payload;
        assert.ok(updatedAt instanceof Date, "az updatedAt-nek Date-nek kell lennie");
        assert.ok(updatedAt.getTime() >= before, "az updatedAt a mostani mentés ideje");
    });

    /* Az átsorolás (húzás) is módosítás: a sorszámot írja. Ugyanaz a két garancia
       jár neki — enélkül egy húzás érvénytelen sorszámot rögzíthetne, és a napi
       export egy csak-átrendezéses napot kihagyna. */
    test(`${section.name} — átsorolás: validátor + friss updatedAt`, async () => {
        await post(section, "/reorder", {id: section.existing._id, order: 2});

        assert.strictEqual(updates.length, 1);
        assert.strictEqual(updates[0].options?.runValidators, true);
        assert.ok(updates[0].payload.updatedAt instanceof Date);
    });
}
