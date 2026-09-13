/* A CSP HÁROM DOLGOT ÍGÉR, ÉS MINDHÁROM NÉMÁN ROMLIK EL.

   1. Az inline boot-szkript hashe illeszkedjen a TÉNYLEGES tartalomra. Ha nem, a
      böngésző blokkolja a szkriptet — a lap működik tovább, csak visszatér a fehér
      villanás. Semmi nem hibázik.
   2. A gyűjtő minta MINDEN <script> taget lásson. Ha egy alakváltozás miatt nem
      illeszkedik, üres listát adna, a CSP hash nélkül menne ki — ugyanaz a néma
      tünet. Ezt a darabszám-ellenőrzés fogja meg, és erre külön teszt van.
   3. A házirend maga ne lazuljon el. Egy 'unsafe-inline' a script-src-be csúszva
      pontosan azt a védelmet kapcsolná ki, amiért az egész készült — és semmi nem
      szólna, mert az app attól még hibátlanul működne.

   A 8. teszt a legfontosabb: az igazi index.html-t vizsgálja. A többi a saját
   fixtúráinkon fut, az pedig a VALÓDI fájl alakját köti — ha az index.html
   szerkezete elmozdul, itt derül ki, nem a böngészőben. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {inlineScripts, scriptHashes, policy, header} = require("./csp");

/* Az "alert(1)" tartalom SHA-256 lenyomata base64-ben, függetlenül kiszámolva
   (node -e 'crypto.createHash("sha256")…'). Bedrótozott érték, szándékosan: ha a
   kódot valaha máshogy hasheljük — más kódolással, trimmeléssel —, ez a teszt
   bukik, nem a böngésző hallgat el. */
const ALERT_HASH = "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='";

test("a CSP inline-szkript felismerése", async (t) => {
    await t.test("az inline tartalmat adja vissza, a külső hivatkozást kihagyja", () => {
        const html = `<html><head>
            <script src="/assets/index-abc.js" type="module"></script>
            <script>alert(1)</script>
        </head></html>`;
        assert.deepStrictEqual(inlineScripts(html), ["alert(1)"]);
    });

    await t.test("több inline szkriptet is megtalál", () => {
        const html = "<script>a()</script><script>b()</script>";
        assert.deepStrictEqual(inlineScripts(html), ["a()", "b()"]);
    });

    await t.test("a src attribútum bárhol állhat a tagben", () => {
        const html = `<script type="module" crossorigin src="/x.js"></script>`;
        assert.deepStrictEqual(inlineScripts(html), []);
    });

    /* Ez a darabszám-ellenőrzés próbája: a lezáratlan tag miatt a gyűjtő minta nem
       illeszkedik, tehát a függvénynek HIBÁT kell dobnia, nem üres listát adnia.
       Enélkül a CSP hash nélkül menne ki, és a boot-szkript némán blokkolódna. */
    await t.test("hibát dob, ha nem tud minden <script> taget elszámolni", () => {
        assert.throws(() => inlineScripts("<script>alert(1)"), /nem tudta feldolgozni/);
    });
});

test("a CSP-hash a tartalom pontos lenyomata", async (t) => {
    await t.test("a hash az ismert értéket adja", () => {
        assert.deepStrictEqual(scriptHashes("<script>alert(1)</script>"), [ALERT_HASH]);
    });

    /* A böngésző a szóközöket és sortöréseket is hasheli. Ha valaha trimmelnénk a
       kivágott tartalmat, a hash eltérne attól, amit a böngésző számol — és a
       szkript blokkolódna. Ez a teszt pont azt a kísértést zárja ki. */
    await t.test("a szóköz és a sortörés is beleszámít", () => {
        const [tight] = scriptHashes("<script>alert(1)</script>");
        const [loose] = scriptHashes("<script>\n  alert(1)\n</script>");
        assert.notStrictEqual(tight, loose);
    });
});

test("a házirend tartalma", async (t) => {
    const value = policy([ALERT_HASH]);
    const directive = (name) =>
        value.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

    await t.test("a script-src a hasht engedi, inline szkriptet NEM", () => {
        assert.match(directive("script-src"), /sha256-/);
        assert.doesNotMatch(directive("script-src"), /unsafe-inline/);
        assert.doesNotMatch(directive("script-src"), /unsafe-eval/);
    });

    /* ELTÉRÉS a script-src-től: a stílus KÉT irányra bontott. Az ELEM-irány
       ('self') tiltja az injektált <style>-t (felület-hamisítás ellen); az
       ATTRIBÚTUM-irány engedi az inline `style=`-t (React/@dnd-kit/@floating-ui).
       Hash egyikben sincs (l. csp.js indoklás). */
    await t.test("a style-src-elem CSAK sajátról enged, inline <style>-t NEM", () => {
        assert.strictEqual(directive("style-src-elem"), "style-src-elem 'self'");
        assert.doesNotMatch(directive("style-src-elem"), /unsafe-inline/);
        assert.doesNotMatch(directive("style-src-elem"), /sha256-/);
    });

    await t.test("a style-src-attr engedi az inline style ATTRIBÚTUMOT", () => {
        assert.match(directive("style-src-attr"), /unsafe-inline/);
        assert.doesNotMatch(directive("style-src-attr"), /sha256-/);
    });

    await t.test("az img-src engedi a data: URI-t (a Bootstrap beágyazott SVG-i)", () => {
        assert.match(directive("img-src"), /data:/);
    });

    await t.test("a Trusted Types kapu 'script'-re követeli meg (DOM-XSS ellen)", () => {
        /* A direktíva elvesztése NÉMA: a lap ugyanúgy működne, csak egy jövőbeli
           HTML-sink (innerHTML) megint némán DOM-XSS-t nyithatna. */
        assert.strictEqual(directive("require-trusted-types-for"),
            "require-trusted-types-for 'script'");
    });

    await t.test("a beágyazás és a <base> korlátozva van", () => {
        assert.strictEqual(directive("frame-ancestors"), "frame-ancestors 'self'");
        assert.strictEqual(directive("base-uri"), "base-uri 'self'");
        assert.strictEqual(directive("object-src"), "object-src 'none'");
    });

    await t.test("amit nem soroltunk fel, azt a default-src fogja meg", () => {
        assert.strictEqual(directive("default-src"), "default-src 'self'");
    });
});

test("a fejléc követi az index.html változását", async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "csp-"));
    const indexPath = path.join(directory, "index.html");
    t.after(() => fs.rmSync(directory, {recursive: true, force: true}));

    const send = (middleware) => {
        const headers = {};
        middleware({}, {setHeader: (name, value) => { headers[name] = value; }}, () => {});
        return headers["Content-Security-Policy"] ?? "";
    };

    await t.test("a hiányzó build nem akadály (fejlesztéskor a Vite szolgál ki)", () => {
        assert.match(send(header(indexPath)), /default-src 'self'/);
    });

    /* EZ A LÉNYEG: a frontend buildje és a backend újraindítása két külön lépés.
       Ha a fejléc csak induláskor számolna, egy build után a RÉGI hasht küldenénk,
       és a böngésző blokkolná az új boot-szkriptet — némán. */
    await t.test("újraszámol, ha a fájl a szerver indulása UTÁN változik", () => {
        fs.writeFileSync(indexPath, "<script>alert(1)</script>");
        const middleware = header(indexPath);
        assert.match(send(middleware), /sha256-bhHHL3z2/);

        fs.writeFileSync(indexPath, "<script>alert(2)</script>");
        /* A módosítási idő felbontása fájlrendszerenként eltér; a tartalom
           változása mellé ezért kimondottan jövőbeli időt is állítunk, hogy a
           vizsgálat ne egy azonos mtime-on múljon. */
        const future = new Date(Date.now() + 2000);
        fs.utimesSync(indexPath, future, future);

        const updated = send(middleware);
        assert.doesNotMatch(updated, /sha256-bhHHL3z2/);
        assert.match(updated, /sha256-/);
    });
});

/* A VALÓDI index.html — ez köti a fixtúrákat a valósághoz.

   A fenti tesztek a saját mintáinkon futnak, tehát önmagukban csak azt
   bizonyítják, hogy a függvény konzisztens. Ez az egy nézi meg, hogy az app
   TÉNYLEGES HTML-je is olyan alakú, amilyennek hisszük. Ha valaki átírja az
   index.html-t (új inline szkript, más idézőjel, becsomagolt boot-kód), itt derül
   ki — nem a böngészőben, egy visszatérő fehér villanás formájában. */
test("az app saját index.html-je pontosan egy inline szkriptet tartalmaz", () => {
    const indexPath = path.join(__dirname, "../../frontend/index.html");
    const scripts = inlineScripts(fs.readFileSync(indexPath, "utf8"));
    assert.strictEqual(scripts.length, 1,
        "Megváltozott az index.html inline szkriptjeinek száma — a CSP-t hozzá kell igazítani.");
    assert.match(scripts[0], /themeBackground/,
        "A boot-szkript nem a téma hátterét állítja — ellenőrizd, mit enged a CSP.");
});
