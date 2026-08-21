/* CONTENT-SECURITY-POLICY — mit futtathat egyáltalán a böngésző a lapunkon.

   MI EZ. A CSP egy HTTP-fejléc, amiben a szerver megmondja a böngészőnek, milyen
   forrásokat fogadhat el: honnan tölthet szkriptet, stílust, képet, hova
   fordulhat hálózaton. Amit a lista nem enged, azt a böngésző MEG SEM PRÓBÁLJA
   — nem a mi kódunk dönt róla, hanem a böngésző motorja.

   MIÉRT MOST. Eddig ki volt kapcsolva, és ez védhető kompromisszum volt. A
   piszkozat-titkosítással viszont a rendszerbe kerül egy titok, ami a JS
   MEMÓRIÁJÁBAN él (a piszkozatokat visszafejtő kulcs). Egy XSS — vagyis idegen
   szkript a mi origin-ünkön — ezt egyetlen sorral kiolvasná. A CSP a fő
   szerkezeti védelem pontosan ez ellen: ha idegen szkript nem futhat, a kulcsot
   nincs mivel kiolvasni. A CSP tehát nem kényelmi tétel, hanem a titkosítás
   előfeltétele.

   A NEHÉZSÉG: EGY INLINE SZKRIPT. Az index.html-ben van egy apró szkript, ami a
   téma hátterét állítja MÉG a stíluslapok betöltése előtt (enélkül fehéren
   villan az első képkocka). A szigorú CSP alapból minden inline szkriptet tilt,
   mert egy XSS pont így jelenik meg. Két kivétel adható: nonce (kérésenként
   generált egyszeri jelszó, amit a HTML-be is bele kell írni) vagy HASH (a
   szkript tartalmának lenyomata). Itt a hash a jó választás, mert a HTML statikus
   fájl — nem kell kérésenként átírni.

   ÉS ITT A LÉNYEG: A HASH A TÉNYLEGES BUILDBŐL SZÁRMAZIK, nem kézzel másolva.
   Egy bemásolt hash a CLAUDE.md 5. pontjának iskolapéldája volna ("kézzel
   szinkronizált másolat"): a szkript egy sorát megváltoztatva a hash elavul, a
   böngésző blokkolja a szkriptet, és a tünet mindössze annyi, hogy visszatér a
   fehér villanás. Semmi nem hibázik — csak rossz lesz. Ezért a hasht a kiszolgált
   index.html-ből számoljuk, futásidőben.

   A STÍLUSOKRÓL — SZÁNDÉKOS ENGEDMÉNY. A `style-src` megkapja az
   'unsafe-inline'-t, a szkriptekkel ellentétben. Két okból:

     - a React `style={{…}}` propja, a @dnd-kit húzás-transzformációi és a
       @floating-ui buborék-pozicionálása mind `style` ATTRIBÚTUMOT írnak, amit
       csak az 'unsafe-inline' (vagy a `style-src-attr`) enged;
     - a `style-src-attr`/`style-src-elem` finomabb bontását nem minden böngésző
       ismeri, és ahol nem, ott a durvább `style-src`-re esik vissza — vagyis a
       "finomabb" megoldás egyes böngészőkben pont a húzást törné el, némán.

   A hash-t és az 'unsafe-inline'-t EGYÜTT megadni hiba volna: ha hash is szerepel
   a listában, a böngésző FIGYELMEN KÍVÜL HAGYJA az 'unsafe-inline'-t — vagyis a
   stílus-hash hozzáadása kapcsolná ki a style attribútumokat. Ezért a stílusokhoz
   szándékosan NINCS hash.

   A kockázat különbsége indokolja az aszimmetriát: egy befecskendezett SZKRIPT
   átveszi a lapot (és elviszi a kulcsot), egy befecskendezett STÍLUS legrosszabb
   esetben adatot szivárogtat szelektor-trükkökkel. A szigor oda kell, ahol a
   titok van. */
const crypto = require("node:crypto");
const fs = require("node:fs");

/* A CSP-hash alakja: 'sha256-<base64>'. A böngésző pontosan az elem szöveges
   tartalmát hasheli — szóközöstül, sortöréstül —, ezért a kivágásnak is pontosan
   a nyitó tag után kell kezdődnie és a lezáró előtt véget érnie. */
const sha256 = (content) =>
    `'sha256-${crypto.createHash("sha256").update(content, "utf8").digest("base64")}'`;

/* AZ INLINE SZKRIPTEK TARTALMA a HTML-ből.

   Ez egy GYŰJTŐ alakú vizsgálat, és azokból tanultunk: ha a minta nem illeszkedik
   (megváltozik a HTML alakja, más lesz az idézőjel, új attribútum kerül a tagbe),
   akkor a függvény nem hibázik, hanem ÜRES listát ad — a CSP kimegy hash nélkül,
   és a szkript némán blokkolódik.

   Ezért a gyűjtés mellé SZÁMLÁLÁS jár: külön megszámoljuk az ÖSSZES <script>
   nyitótaget és külön a külső (src=…) hivatkozásokat. Ha a kettő összege nem jön
   ki az inline találatokkal, akkor a minta nem azt fogta meg, amit hittünk —
   ilyenkor hibát dobunk, mert a néma féleredmény rosszabb, mint a leállás.

   A LEZÁRÓ TAGRE illesztünk (`[\s\S]*?</script>`), nem a megengedett karakterek
   listájára — a nem mohó illesztés a legelső lezárásig tart. */
function inlineScripts(html) {
    const openTags = html.match(/<script\b/gi) ?? [];
    const withSource = html.match(/<script\b[^>]*\ssrc\s*=/gi) ?? [];
    const inline = [...html.matchAll(/<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi)]
        .map((match) => match[1] ?? "");

    if (inline.length + withSource.length !== openTags.length) {
        throw new Error(
            `A CSP nem tudta feldolgozni az index.html-t: ${openTags.length} <script> tagből ` +
            `${inline.length} inline és ${withSource.length} külső hivatkozás jött ki. ` +
            "A CSP-hash így hiányos lenne, és a boot-szkript némán blokkolódna.",
        );
    }
    return inline;
}

/** Az inline szkriptek CSP-hashei — ezekkel engedjük futni őket. */
function scriptHashes(html) {
    return inlineScripts(html).map(sha256);
}

/* A HÁZIREND ÖSSZEÁLLÍTÁSA. Minden irány külön kimondva; ami nincs a listán, azt
   a `default-src 'self'` fogja meg.

   - script-src: a saját bundle + a boot-szkript hashe. NINCS 'unsafe-inline',
     NINCS 'unsafe-eval' — ellenőrizve, hogy a buildelt csomag nem használ
     eval-t vagy new Function-t.
   - img-src: a 'self' mellé `data:` is kell — a Bootstrap CSS-e 25 helyen ágyaz
     be SVG-t data URI-ként (legördülők nyila, jelölőnégyzetek pipája). Enélkül
     ezek némán eltűnnének.
   - connect-src 'self': élesben a frontend relatív URL-lel hívja az API-t, tehát
     azonos origin. (A Vite dev szerver külön origin, de ott a lapot a Vite
     szolgálja ki, nem ez az Express — erre a fejlécre ott nem is kerül sor.)
   - frame-ancestors 'self': idegen oldal ne ágyazhasson be minket (clickjacking).
     SZÁNDÉKOSAN 'self' és nem 'none': a telefon-szélesség reprodukálásához saját
     origin-ról iframe-be tesszük az appot — a 'none' ezt a hibakeresési eszközt
     törné el.
   - base-uri 'self': egy befecskendezett <base> tag különben minden relatív
     hivatkozást idegen kiszolgálóra irányíthatna át.
   - object-src 'none': plugin-tartalom (<object>, <embed>) sehonnan. */
function policy(hashes) {
    const directives = {
        "default-src": ["'self'"],
        "script-src": ["'self'", ...hashes],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        "font-src": ["'self'"],
        "connect-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
    };
    return Object.entries(directives)
        .map(([name, values]) => `${name} ${values.join(" ")}`)
        .join("; ");
}

/* A HÁZIREND FRISS TARTÁSA — miért nem elég egyszer, induláskor.

   A frontend buildje és a backend újraindítása KÉT KÜLÖN LÉPÉS, és a sorrendjüket
   semmi nem kényszeríti ki (nincs olyan telepítő szkript, ami a kettőt összekötné).
   Egy `npm run build` után a futó szerver a RÉGI hasht hordozná, a böngésző pedig
   blokkolná az új boot-szkriptet — a tünet megint csak a visszatérő fehér villanás.
   Néma hiba, pontosan az a fajta, ami ellen az egész hash-számolás készült.

   Ezért az index.html módosítási idejét nézzük, és ha változott, újraszámolunk. A
   `statSync` ára mikroszekundumokban mérhető; a mért ~135 kérés/s plafonhoz képest
   elhanyagolható. Cserébe a "buildelj, aztán indítsd újra" sorrend megszűnik
   rejtett feltételnek lenni — nem kell betartani, mert nem számít.

   AZ ELSŐ SZÁMÍTÁS INDULÁSKOR fut le, nem az első kérésnél: egy feldolgozhatatlan
   index.html így a szerver indulásakor bukik el (a naplóban, a systemd
   újraindítás-hurkában látható módon), nem pedig kérésenkénti 500-akban. */
function header(indexPath) {
    /* A build hiányozhat (fejlesztéskor a lapot a Vite szolgálja ki, ez az Express
       csak az API-t adja). Olyankor nincs inline szkript, amit engedni kellene. */
    const modifiedAt = () => {
        try {
            return fs.statSync(indexPath).mtimeMs;
        } catch {
            return null;
        }
    };

    let cache = null;
    const refresh = (mtimeMs) => {
        const hashes = mtimeMs === null ? [] : scriptHashes(fs.readFileSync(indexPath, "utf8"));
        cache = {mtimeMs, value: policy(hashes)};
    };
    refresh(modifiedAt());

    return (request, response, next) => {
        const mtimeMs = modifiedAt();
        if (cache.mtimeMs !== mtimeMs) refresh(mtimeMs);
        response.setHeader("Content-Security-Policy", cache.value);
        next();
    };
}

module.exports = {inlineScripts, scriptHashes, policy, header};
