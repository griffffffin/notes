/* KÖZÖS ROUTER-SZONDA a derived wiring-kapukhoz.

   Több kapu ugyanazt a kérdést teszi fel a FELÉPÜLT routernek (nem a forrás
   szövegének, ami formázás-függő és némán kihagy — l. authBoundary.test.js): egy
   szekció adott végpontjának láncában ott van-e egy konkrét middleware? A
   serializeBoundary a serializePerUser-t keresi, a validationBoundary a
   törzs-validátort. A szonda-logika EGY helyen éljen, ne másolatokban, amik
   csendben elcsúsznak (CLAUDE.md, kézzel szinkronizált másolat).

   NEM tesztfájl (nincs `.test.` a nevében), így a `node --test` nem futtatja
   önmagában; a kapu-tesztek importálják, mint a test/authStub.js-t. */
const assert = require("node:assert");

/* Illeszkedik-e a réteg erre a (relatív) címre? A hibát NEM nyeljük el: ha a
   `layer.match` egyszer eltűnik vagy mást vár, arról tudni kell — a néma `false`
   pont azt a csendes átengedést hozná vissza, ami ellen a kapuk vannak. */
function layerMatches(layer, probe) {
    assert.strictEqual(typeof layer.match, "function",
        "Az Express Layer-nek nincs match() metódusa — a könyvtár belső alakja megváltozott. " +
        "A rá épülő wiring-kapuk átvezetést kívánnak; addig NEM őriznek semmit.");
    return !!layer.match(probe);
}

/* A `<szekció>` mountolt al-routere: az EGYETLEN router-réteg, ami a
   `/<szekció>/create` címre illeszkedik. A `router.use(auth)` és a közbeékelt
   middleware-ek nem routerek (nincs `handle.stack`), így kiesnek; ha valaha több
   router illeszkedne ugyanarra, azt HANGOSAN jelezzük, nem az elsőt választjuk. */
function sectionRouter(routes, section) {
    assert.ok(Array.isArray(routes.stack),
        "Az Express router nem ad `stack` tömböt — a könyvtár belső alakja megváltozott.");
    const probe = `/${section}/create`;
    const routerLayers = routes.stack.filter((layer) =>
        typeof layer.handle === "function" && Array.isArray(layer.handle.stack) && layerMatches(layer, probe));
    assert.strictEqual(routerLayers.length, 1,
        `A(z) "${section}" szekcióhoz nem pontosan egy mountolt al-router illeszkedik a ${probe} címre ` +
        `(találtam: ${routerLayers.length}) — a route-szerkezet megváltozott.`);
    return routerLayers[0].handle;
}

/* Van-e a `/<op>` láncában olyan réteg, amelynek a HANDLE-jére igaz a predikátum?
   AZONOSSÁG vagy jelölő szerint keresünk — nem név, nem sorszám. */
function chainHas(subRouter, op, predicate) {
    const probe = `/${op}`;
    return subRouter.stack.some((layer) => layerMatches(layer, probe) && predicate(layer.handle));
}

module.exports = {layerMatches, sectionRouter, chainHas};
