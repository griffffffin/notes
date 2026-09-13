/* A PERMISSIONS-POLICY fejléc tesztjei.

   A fejléc néma védelem: ha lemarad vagy elgépeljük, semmi nem hibázik — a lap
   ugyanúgy működik, csak a felesleges böngésző-képességek megint nyitva állnak, és
   a vágólap-kivétel rossz iránya (write helyett read) épp a megosztást törné el
   vagy a vágólap-olvasást nyitná meg. Ezért a fejléc MEGLÉTÉT és a kényes két
   vágólap-irányt külön állítjuk. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

const {permissionsPolicy} = require("./permissionsPolicy");

const app = express();
app.use(permissionsPolicy);
app.get("/probe", (request_, response) => response.json({ok: true}));

test("a válasz VISZ Permissions-Policy fejlécet", async () => {
    const response = await request(app).get("/probe");
    assert.ok(response.headers["permissions-policy"],
        "nincs Permissions-Policy fejléc — a képességek alapból mind nyitva állnának");
});

test("a vágólap-ÍRÁS engedett az azonos originnek (a megosztás gomb enélkül elromlana)", async () => {
    const response = await request(app).get("/probe");
    assert.match(response.headers["permissions-policy"], /clipboard-write=\(self\)/,
        "a clipboard-write nem (self) — a Quotes/shareButton.tsx másolása némán elromlana");
});

test("a vágólap-OLVASÁS teljesen tiltott", async () => {
    const response = await request(app).get("/probe");
    assert.match(response.headers["permissions-policy"], /clipboard-read=\(\)/,
        "a clipboard-read nincs tiltva — egy támadó a felhasználó máshonnan másolt titkait olvashatná");
});

test("a nem használt képességek tiltva vannak (mintavétel)", async () => {
    /* Nem soroljuk fel mindet — a mintavétel elég annak őrzésére, hogy a lista a
       tiltó `()` alakot használja, nem a megengedőt. */
    const policy = (await request(app).get("/probe")).headers["permissions-policy"];
    for (const feature of ["camera", "geolocation", "microphone", "usb", "payment"])
        assert.match(policy, new RegExp(`${feature}=\\(\\)`),
            `a(z) ${feature} nincs tiltva — a nem használt képességeket () -val zárjuk`);
});
