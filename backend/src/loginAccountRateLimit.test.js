/* A LOGIN FIÓK-ALAPÚ KÉRÉS-KORLÁTJA — a VALÓDI routeren.

   Miért külön fájl. Ez a teszt szándékosan KIMERÍTI a fiók-korlát ablakát, és a
   korlátozó modul-szintű állapotot tart. A `node --test` minden tesztFÁJLT külön
   folyamatban futtat, tehát itt tiszta lappal indulunk, és nem terheljük rá a
   fogyasztást az authRateLimit.test.js IP-korlát-tesztjeire (és fordítva).

   MIT ŐRIZ. A /login elé KÉT korlát van kötve: egy IP-alapú (első) és egy
   fiók-alapú (a validáció után). A második elvesztése NÉMA: a bejelentkezés
   ugyanúgy működne, csak egy botnet ezer IP-ről végigpróbálhatna egy jelszó-
   szótárat EGYETLEN fiókra, mert IP-nként külön vödörbe esve átcsúszna az
   IP-korláton. Ez a teszt épp ezt a több-IP-s támadást játssza le.

   HOGYAN KERÜLI MEG AZ IP-KORLÁTOT. `trust proxy` bekapcsolva, és minden kérés
   MÁS `X-Forwarded-For` címről jön — így az IP-korlát (címenként 1 kérés) sosem
   üt be, és tisztán a fiók-korlát marad a vizsgált. (Proxy nélkül élesben az
   X-Forwarded-For NEM megbízható — l. rateLimit.js —, itt a teszt SAJÁT,
   ellenőrzött környezetében viszont pont ezt akarjuk szimulálni.)

   MIÉRT NINCS DB ÉS HASHELÉS. A fiók-korlát a validáció UTÁN, a controller ELŐTT
   ül; az odáig eljutó kéréseknek érvényes törzs kell, és elérnék a login
   controllert (DB-lekérdezés + ~244 ms álca-hash kérésenként). Ezt a két
   függőséget egy VALÓS úttal csonkoljuk: `findOne` → nincs ilyen fiók,
   `verifyPassword` → nem egyezik, vagyis a "hibás név vagy jelszó" (400) ág — így a
   teszt DB nélkül, ezredmásodpercek alatt fut, és semmi kitaláltat nem tükröz. */
const test = require("node:test");
const assert = require("node:assert");
const express = require("express");
const request = require("supertest");

process.env.JWT_SECRET = process.env.JWT_SECRET || "teszt-titok";

/* A csonkolás a KÖZÖS modul-példányokon megy, a routes betöltése ELŐTT. A
   login.js ugyanezt a `Users` objektumot és `password` modult kapja (require-
   gyorsítótár). A `Users` metódusait hívási időben oldja fel, a `verifyPassword`-öt
   viszont betöltéskor DESTRUKTURÁLJA — ezért a felülírásnak a login require-je ELŐTT
   kell megtörténnie a password modul exportált objektumán, hogy a login már a
   csonkolt függvényt kapja. A folyamat-szintű izoláció miatt (külön tesztfájl =
   külön process) ez nem szivárog más tesztekre. */
const Users = require("./models/users");
Users.findOne = async () => null;
const password = require("./password");
password.verifyPassword = async () => false;

const routes = require("./routes");

const app = express();
app.set("trust proxy", true);   // hogy az X-Forwarded-For legyen a request.ip
app.use(express.json());
app.use(routes);

// Minden kérés MÁS IP-ről (egyedi XFF), közös törzzsel — a fiók a törzs `name`-je.
let nextIp = 1;
const loginAs = (name) =>
    request(app).post("/login")
        .set("X-Forwarded-For", `10.0.${Math.floor(nextIp / 256)}.${nextIp++ % 256}`)
        .send({name, password: "Aa123456"});

test("a fiók-korlát több IP-ről is EGY vödörbe teszi az azonos fiókot", async () => {
    /* A darabszámra NEM állítunk (a keret a routes.js döntése): addig lövünk, amíg
       429-et nem kapunk, de sok IP-ről. Ha a fiók-korlát nincs bekötve, ez sosem
       jön — hiszen minden kérés külön IP-vödörben ül, és az IP-korlát alatt marad. */
    let blockedAt = null;
    for (let attempt = 1; attempt <= 60 && blockedAt === null; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await loginAs("alice");
        if (response.status === 429) blockedAt = attempt;
        else assert.strictEqual(response.status, 400,
            `a(z) ${attempt}. kérés se 429, se 400 (hibás név/jelszó) — váratlan: ${response.status}`);
    }

    assert.ok(blockedAt !== null,
        "hatvan kérés után, sok IP-ről sem jött 429 — a fiók-alapú korlát nincs bekötve a /login elé");
    /* A jogos használat kerete tág legyen: pár elgépelés + zaj ne zárjon ki. Az
       IP-korlát 20-as keretét felül kell múlnia (különben nem is a fiók-korlát
       ütött, hanem az IP-é — de az egyedi IP-k miatt az itt nem is üthet). */
    assert.ok(blockedAt > 20,
        `a fiók-korlát már a(z) ${blockedAt}. kísérletre ütött — ez túl szűk, vagy az IP-korlát fogott meg`);
});

test("a fiók-korlát fiókONKÉNT külön — más névre nem terül rá", async () => {
    /* Az előző teszt kimerítette az "alice" vödrét. Egy MÁS fiók (bob) friss IP-ről
       a maga 400-át kapja, nem 429-et — a korlát a névre szól, nem globális. Ha
       ez 429 volna, a fiók-korlát valójában mindenkit egy vödörbe tenne. */
    const response = await loginAs("bob");

    assert.strictEqual(response.status, 400,
        "egy másik fiók is 429-et kapott — a fiók-korlát nem fiókonként számol");
});
