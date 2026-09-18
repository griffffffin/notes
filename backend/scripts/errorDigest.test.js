/* A HETI DIGEST — a KIMENET BIZTONSÁGA az első.

   A digest a Gmailen (3. fél) megy át, ezért a legfontosabb teszt nem a
   darabszámok pontossága, hanem hogy a hiba ÜZENETE, VERME és bármely felhasználói
   tartalom SOHA nem szivárog a kimenetbe — csak számok, saját context-címkék és
   útvonalak. A titok-próba (lentebb) ezt méri: mérgezett bemenetre a titok NEM
   jelenhet meg a digestben. */
const test = require("node:test");
const assert = require("node:assert");
const {summarize, formatDigest, messagesFromJsonLines} = require("./errorDigest");

const TS = "[2026-09-18T10:00:00.000Z]";
const digestOf = (messages, extra = {}) =>
    formatDigest(summarize(messages), {period: "teszt", infoCount: 0, noticeCount: 0, ...extra});

test("szerver-hibák a context szerint csoportosítva, darabszámmal", () => {
    const summary = summarize([
        `${TS} Todos.update: ValidationError: cím kötelező`,
        `${TS} Todos.update: CastError: rossz id`,
        `${TS} Users.login: Error: bumm`,
    ]);

    assert.strictEqual(summary.serverTotal, 3);
    assert.strictEqual(summary.serverByContext.get("Todos.update"), 2);
    assert.strictEqual(summary.serverByContext.get("Users.login"), 1);
});

test("a többsoros verem NEM zavar: csak az első sor context-je számít", () => {
    const summary = summarize([
        `${TS} Todos.create: Error: bumm\n    at foo (/opt/notes/backend/src/x.js:1:1)\n    at bar`,
    ]);

    assert.strictEqual(summary.serverByContext.get("Todos.create"), 1);
});

test("kliens-szerződés hibák a végpont szerint csoportosítva", () => {
    const summary = summarize([
        `${TS} Kliens-szerződés hiba: /quotes/id`,
        `${TS} Kliens-szerződés hiba: /quotes/id`,
        `${TS} Kliens-szerződés hiba: /to-dos`,
    ]);

    assert.strictEqual(summary.clientTotal, 3);
    assert.strictEqual(summary.clientByEndpoint.get("/quotes/id"), 2);
    assert.strictEqual(summary.clientByEndpoint.get("/to-dos"), 1);
});

test("a nem a mi formátumunk (systemd err) csak SZÁMÍT, tartalom nélkül", () => {
    const summary = summarize([
        "notes.service: Main process exited, code=exited, status=1/FAILURE",
        "notes.service: Failed with result 'exit-code'.",
    ]);

    assert.strictEqual(summary.otherTotal, 2);
    assert.strictEqual(summary.serverTotal, 0);
    assert.strictEqual(summary.clientTotal, 0);
});

/* A LEGFONTOSABB TESZT: mérgezett bemenet — a hiba üzenetében titok, a
   contextben/végpontban tiltott karakter, a systemd-sorban belső részlet. A
   digest kimenetében EGYIK sem jelenhet meg. */
test("BIZTONSÁG: sem titok, sem üzenet/verem, sem tiltott címke nem szivárog a kimenetbe", () => {
    const SECRET = "SUPERTITOK_JELSZO_123";
    const digest = digestOf([
        // titok a hiba ÜZENETÉBEN + verem
        `${TS} Users.login: Error: password=${SECRET} at auth\n    at hash (/opt/notes/backend/src/password.js:9:9)`,
        // tiltott karakter a contextben (furcsa kérés-útból) → "egyéb"
        `${TS} POST /x?token=${SECRET}: valami`,
        // nem útvonal-alakú végpont (injekció-kísérlet) → "egyéb"
        `${TS} Kliens-szerződés hiba: /x;${SECRET}`,
        // systemd-sor belső részlettel → csak szám
        `notes.service: exited with ${SECRET}`,
    ]);

    assert.ok(!digest.includes(SECRET), "TITOK szivárgott a digestbe");
    assert.ok(!digest.includes("password="), "a hiba ÜZENETE szivárgott a digestbe");
    assert.ok(!digest.includes("password.js"), "a VEREM szivárgott a digestbe");
    assert.ok(!digest.includes("Main process") && !digest.includes("exited with"),
        "a systemd-sor NYERS tartalma szivárgott a digestbe");
    // A biztonságos aggregátum viszont OTT van: a "Users.login" context és az "egyéb".
    assert.match(digest, /Users\.login: 1/);
    assert.match(digest, /egyéb/);
});

test("a túl hosszú vagy tiltott context 'egyéb'-be esik, a tartalma nélkül", () => {
    const summary = summarize([
        `${TS} ${"x".repeat(200)}: bumm`,          // túl hosszú
        `${TS} badctx: bumm`,                // vezérlőkarakter a címkében
    ]);

    assert.strictEqual(summary.serverByContext.get("egyéb"), 2);
});

test("üres bemenet: minden nulla, a levél akkor is elmegy", () => {
    const digest = digestOf([]);

    assert.match(digest, /Hibák \(err\) összesen: 0/);
    assert.match(digest, /Szerver-hibák: 0/);
    assert.match(digest, /Kliens-szerződés hibák: 0/);
});

test("a formátum kiírja a notice/info számokat és az időszakot", () => {
    const digest = digestOf([], {period: "2026-09-14 – 2026-09-21", infoCount: 141, noticeCount: 1});

    assert.match(digest, /Időszak: 2026-09-14 – 2026-09-21/);
    assert.match(digest, /notice \(5\): 1/);
    assert.match(digest, /info \(6\): 141/);
});

test("messagesFromJsonLines: kibontja a MESSAGE-t, a bájt-tömböt is, a rossz sort átugorja", () => {
    const jsonLines = [
        JSON.stringify({MESSAGE: `${TS} Todos.update: bumm`, PRIORITY: "3"}),
        "ez nem json — átugorjuk",
        JSON.stringify({MESSAGE: [104, 105], PRIORITY: "3"}),   // "hi" bájtokban
        "",
    ].join("\n");

    const messages = messagesFromJsonLines(jsonLines);

    assert.strictEqual(messages.length, 2);
    assert.match(messages[0], /Todos\.update: bumm/);
    assert.strictEqual(messages[1], "hi");
});
