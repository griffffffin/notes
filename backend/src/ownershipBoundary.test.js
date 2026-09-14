/* TÖBB-BÉRLŐS TULAJDON-HATÁR — minden szekció, auto-felderítve.

   A projekt EGYETLEN legfontosabb biztonsági szabálya: egy elemhez csak a
   tulajdonosa nyúlhat, és egy lista csak a KÉRŐ elemeit adja ki (l. ownership.js).
   Eddig ezt szekciónként KÉZZEL írt tesztek őrizték (Quotes/ownership.test.js,
   Todos/ownership.test.js) — egy JÖVŐBELI szekció, ami elfelejti a `findOwned`-et
   vagy a `user`-szűrőt, kimaradna belőlük, és IDEGEN ADATOT adna ki, némán.

   Ez a gate a szekció-modelleket a nyilatkozatukból (exportName = az URL-szegmens,
   l. itemQuota.test.js) fésüli át, tehát egy új szekció AUTOMATIKUSAN fedve van.
   Két, szekció-agnosztikus vektort zár (az /update törzse szekció-specifikus, azt
   a szekció saját kézi tesztje fedi):

     - PER-ELEM ÍRÁS (/delete, /reorder): egy IDEGEN kérése 403 (findOwned), a
       tulajdonosé NEM 403 (a 403 feltételes, nem vak);
     - LISTA (POST /<szekció>): a lekérdezés a KÉRŐRE szűr — a `user`-szűrő
       elhagyása nem egy elemet, hanem MINDENKI adatát adná ki (findOwnedList). */
const {describe, it} = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const request = require("supertest");
const mongoose = require("mongoose");
const {isModelFile} = require("../scripts/exportSections");
const {userStub, sessionCookieFor} = require("./test/authStub");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";
/* A tulajdonos írás-útja (findOwned után) valódi DB-műveletre fut; DB nincs, így
   rövid puffer-határidővel gyorsan 500-zal elszáll — nekünk csak az kell, hogy NEM
   403 (a tulajdon-ellenőrzés átengedte). */
mongoose.set("bufferTimeoutMS", 50);

const OWNER = "507f1f77bcf86cd799439011";
const STRANGER = "507f1f77bcf86cd799439012";
const ITEM_ID = "507f1f77bcf86cd7994390aa";

const Users = require("./models/users");
Users.findById = async (id) => ([OWNER, STRANGER].includes(String(id)) ? userStub(id) : null);

const routes = require("./routes");
const app = express();
app.use(express.json());
app.use(routes);

const MODELS_DIR = path.join(__dirname, "models");
const sectionModels = fs.readdirSync(MODELS_DIR).filter(isModelFile).sort()
    .map((file) => [file, require(path.join(MODELS_DIR, file))])
    .filter(([, model]) => typeof model.exportName === "string" && model.exportName.trim() !== "");

// Az OWNER tulajdonú elem, amit a mockolt findById ad vissza (a mezők a delete/
// reorder controllereknek elegek: user, order, cím).
const ownerItem = () => ({_id: ITEM_ID, user: OWNER, order: 5, title: "x", quote: "x"});

describe("több-bérlős tulajdon: minden szekció idegent kizár (derived)", () => {
    /* KONTROLL az elnémult gate ellen: ha a felderítés elromlik, a lenti hurok
       üresen futna, és zölden jelentene semmit. */
    it("van legalább egy szekció-modell (különben a gate üresen zöldülne)", () => {
        assert.ok(sectionModels.length >= 2, `csak ${sectionModels.length} szekció-modellt találtam`);
    });

    for (const [, Model] of sectionModels) {
        const base = `/${Model.exportName}`;

        it(`${base}/delete: IDEGEN 403, tulajdonos NEM 403`, async () => {
            const original = Model.findById;
            Model.findById = async () => ownerItem();
            try {
                const stranger = await request(app).post(`${base}/delete`)
                    .set("Cookie", sessionCookieFor(STRANGER)).send({id: ITEM_ID});
                assert.strictEqual(stranger.status, 403,
                    `${base}/delete idegennek nem 403 (hanem ${stranger.status}) — hiányzik a findOwned?`);
                const owner = await request(app).post(`${base}/delete`)
                    .set("Cookie", sessionCookieFor(OWNER)).send({id: ITEM_ID});
                assert.notStrictEqual(owner.status, 403,
                    `${base}/delete a TULAJDONOST is elutasította — a 403 feltétel nélküli?`);
            } finally {
                Model.findById = original;
            }
        });

        it(`${base}/reorder: IDEGEN 403, tulajdonos NEM 403`, async () => {
            const original = Model.findById;
            Model.findById = async () => ownerItem();
            try {
                const stranger = await request(app).post(`${base}/reorder`)
                    .set("Cookie", sessionCookieFor(STRANGER)).send({id: ITEM_ID, order: 3});
                assert.strictEqual(stranger.status, 403,
                    `${base}/reorder idegennek nem 403 (hanem ${stranger.status}) — hiányzik a findOwned?`);
                const owner = await request(app).post(`${base}/reorder`)
                    .set("Cookie", sessionCookieFor(OWNER)).send({id: ITEM_ID, order: 3});
                assert.notStrictEqual(owner.status, 403,
                    `${base}/reorder a TULAJDONOST is elutasította — a 403 feltétel nélküli?`);
            } finally {
                Model.findById = original;
            }
        });

        it(`${base}/update: IDEGEN 403, tulajdonos NEM 403`, async () => {
            /* Ezt a requireOwnership middleware-esítése tette derived-tesztelhetővé:
               az őr a body-validáció ELŐTT áll, tehát az idegen kérése pusztán az
               id-val 403-at kap. A tulajdonos ugyanezzel a törzs-nélküli kéréssel a
               body-validátoron akad el (400) — ami épp azt bizonyítja, hogy az
               ownership-őr ÁTENGEDTE (nem 403). */
            const original = Model.findById;
            Model.findById = async () => ownerItem();
            try {
                const stranger = await request(app).post(`${base}/update`)
                    .set("Cookie", sessionCookieFor(STRANGER)).send({id: ITEM_ID});
                assert.strictEqual(stranger.status, 403,
                    `${base}/update idegennek nem 403 (hanem ${stranger.status}) — hiányzik a requireOwnership?`);
                const owner = await request(app).post(`${base}/update`)
                    .set("Cookie", sessionCookieFor(OWNER)).send({id: ITEM_ID});
                assert.notStrictEqual(owner.status, 403,
                    `${base}/update a TULAJDONOST is elutasította — a 403 feltétel nélküli?`);
            } finally {
                Model.findById = original;
            }
        });

        it(`${base} (lista): a lekérdezés a KÉRŐRE szűr (nem mindenki adatát adja)`, async () => {
            const original = Model.find;
            let captured = null;
            Model.find = (query) => { captured = query; return {sort: () => Promise.resolve([])}; };
            try {
                const response = await request(app).post(base)
                    .set("Cookie", sessionCookieFor(OWNER)).send({});
                assert.strictEqual(response.status, 200, `${base} lista nem 200 (hanem ${response.status})`);
                assert.ok(captured, `${base} lista nem a Model.find-en át kérdezett — findOwnedList helyett más?`);
                assert.strictEqual(captured.user, OWNER,
                    `${base} lista NEM a kérőre szűr (user=${JSON.stringify(captured?.user)}) — a user-szűrő ` +
                    "elhagyása MINDENKI adatát kiadná (findOwnedList).");
            } finally {
                Model.find = original;
            }
        });
    }
});
