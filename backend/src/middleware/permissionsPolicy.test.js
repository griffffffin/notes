/* A PERMISSIONS-POLICY fejléc tesztjei.

   A fejléc néma védelem: ha lemarad vagy elgépeljük, semmi nem hibázik — a lap
   ugyanúgy működik, csak a felesleges böngésző-képességek megint nyitva állnak.
   Ezért a fejléc MEGLÉTÉT és a kényes vágólap-irányokat külön állítjuk. Az E2EE-átállás
   után a link-másoló megosztás kikerült, tehát a vágólap MINDKÉT iránya tiltva. */
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

test("a vágólap-ÍRÁS is tiltott (az E2EE után nincs link-másoló megosztás)", async () => {
    const response = await request(app).get("/probe");
    assert.match(response.headers["permissions-policy"], /clipboard-write=\(\)/,
        "a clipboard-write nincs tiltva — ma senki nem ír a vágólapra, tehát a legkisebb " +
        "jogosultság elve szerint zárva legyen (a megosztás-menet nyitja majd újra, ha kell)");
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
