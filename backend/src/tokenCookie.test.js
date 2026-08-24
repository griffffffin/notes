/* A SÜTI-KIOLVASÓ TESZTJEI.

   Miért kap saját tesztet egy tízsoros függvény: mert a hibája NEM hangos. Egy
   laza névillesztés nem összeomlik, hanem egy MÁSIK süti tartalmát adja vissza
   tokenként — a `jwt.verify` elutasítja, a szerver 401-et küld, a felhasználót
   pedig kilépteti a rendszer, miközben érvényesen be van jelentkezve. A tünet
   ("néha kidob") teljesen elszakad az októl. */
const test = require("node:test");
const assert = require("node:assert");
const {readTokenCookie, setTokenCookie, clearTokenCookie} = require("./tokenCookie");

const withCookies = (header) => ({headers: header === null ? {} : {cookie: header}});

test("kiolvassa az egyetlen sütit", () => {
    assert.strictEqual(readTokenCookie(withCookies("token=abc.def.ghi")), "abc.def.ghi");
});

test("több süti közül a nevéről találja meg, a sorrendtől függetlenül", () => {
    assert.strictEqual(readTokenCookie(withCookies("backgroundColor=white; token=jwt; a=b")), "jwt");
    assert.strictEqual(readTokenCookie(withCookies("a=b; backgroundColor=white; token=jwt")), "jwt");
});

test("a szóközöket lenyeli a nevek és az értékek körül", () => {
    assert.strictEqual(readTokenCookie(withCookies("a=b;   token=jwt  ; c=d")), "jwt");
});

test("HASONLÓ NEVŰ sütit NEM fogad el", () => {
    /* Ez a teszt lényege. Mindhárom fejléc tartalmazza a "token=" szöveget, és egy
       `includes`-alapú kiolvasás mindhármat elfogadná — a szerver pedig egy
       téma-beállítást vagy egy idegen értéket próbálna JWT-ként ellenőrizni. */
    assert.strictEqual(readTokenCookie(withCookies("theme_token=hamis")), null);
    assert.strictEqual(readTokenCookie(withCookies("token_backup=hamis")), null);
    assert.strictEqual(readTokenCookie(withCookies("egyeb=x=token=hamis")), null);
});

test("hiányzó fejléc és üres érték: nincs token (nem üres string)", () => {
    /* Az üres string HAMIS értékű, de nem `null` — ha átcsúszna, a hívó
       "van tokenem" ágra futna, és a `jwt.verify` dobna. A `null` egyértelmű. */
    assert.strictEqual(readTokenCookie(withCookies(null)), null);
    assert.strictEqual(readTokenCookie(withCookies("token=")), null);
    assert.strictEqual(readTokenCookie(withCookies("token=   ")), null);
});

test("az érték belsejében lévő = nem csonkít", () => {
    assert.strictEqual(readTokenCookie(withCookies("token=a=b=c")), "a=b=c");
});

/* A KIADÁS ÉS A TÖRLÉS UGYANAZOKAT A JELZŐKET KAPJA. Ha elcsúsznának, a törlés
   némán nem törölne: a böngésző csak az azonos név+path+jelzők sütijét dobja el,
   tehát a "kijelentkezett" felhasználó sütije a helyén maradna. */
test("a kiadás és a törlés jelzői EGYEZNEK, és httpOnly + strict van rajtuk", () => {
    const calls = [];
    const response = {
        cookie: (name, value, options) => calls.push({what: "set", name, value, options}),
        clearCookie: (name, options) => calls.push({what: "clear", name, options}),
    };
    const request = {secure: false};

    setTokenCookie(request, response, "jwt");
    clearTokenCookie(request, response);

    const [set, cleared] = calls;
    assert.strictEqual(set.name, cleared.name, "ugyanaz a név");
    assert.deepStrictEqual(set.options, cleared.options, "ugyanazok a jelzők");
    assert.strictEqual(set.options.httpOnly, true, "a JS nem láthatja");
    assert.strictEqual(set.options.sameSite, "strict", "idegen oldalról ne menjen el");
    assert.strictEqual(set.options.path, "/", "az egész appra szóljon");
    assert.ok(!("maxAge" in set.options) && !("expires" in set.options),
        "munkamenet-süti: a böngésző bezárásakor tűnjön el");
});

test("a secure jelző a KÉRÉS protokolljához igazodik", () => {
    /* Ma HTTP-n szolgálunk ki: `secure: true` esetén a böngésző a sütit ki sem
       írná, és a bejelentkezés némán működésképtelen lenne. HTTPS-re váltva
       viszont magától bekapcsol — nincs kapcsoló, amit el lehetne felejteni. */
    const captured = [];
    const response = {cookie: (name, value, options) => captured.push(options)};

    setTokenCookie({secure: false}, response, "jwt");
    setTokenCookie({secure: true}, response, "jwt");

    assert.strictEqual(captured[0].secure, false);
    assert.strictEqual(captured[1].secure, true);
});
