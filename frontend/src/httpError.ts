/* MI SZÁMÍT NÁLUNK HTTP-HIBÁNAK — egy helyen, VALÓDI ellenőrzéssel.

   Egy elutasított kérésről semmit nem tudunk előre: a JavaScriptben bármit el
   lehet dobni, és a hibaágba nem csak a szerver válasza érkezhet, hanem hálózati
   hiba, időtúllépés, vagy a sikerágban dobott kivétel is. A típusa ezért
   `unknown` — a fordító addig nem enged hozzányúlni, amíg meg nem mondjuk, minek
   nézzük.

   MEGMONDANI KÉTFÉLEKÉPPEN LEHET, és a különbség lényegi:

     - `error as {response?: {status?: number}}` — ez ÁLLÍTÁS. Nem ellenőriz
       semmit, csak közli a fordítóval, hogy bízzon bennünk. Ha a hiba egyszer
       mégis más alakú, senki nem szól: a kiléptetés csak elmarad. Vagyis egy
       `as`-szal pont azt a néma hibát engedjük vissza, ami ellen a típusok
       vannak.
     - az alábbi függvények — ezek ELLENŐRIZNEK. Végigjárják az alakot
       futásidőben, és ha nem stimmel, `undefined`-ot adnak. A fordítónak nem kell
       hinnie semmit, mert a `typeof`/`in` vizsgálatokból maga is látja.

   Miért az ALAK dönt, és nem az, hogy ki dobta? Kézenfekvő volna az
   `axios.isAxiosError()` típusőrt hívni, de az CSAK valódi AxiosError-példányokat
   ismer el. Ezzel a kiléptetés szabálya a HTTP-kliens identitásához kötődne: ha
   egyszer lecseréljük az axiost, vagy egy interceptor becsomagolja a hibát, a
   szabály némán hatástalanná válna. (Nem elmélet: az auth.test.tsx egy sima
   `{response: {status: 401}}`-gyel utasít el, és az isAxiosError-ra átírt kód
   ettől elhasalt — a lejárt tokenre nem jelentkeztetett ki.) A "van 401-es
   státusza" viszont attól igaz, ami a válaszban áll. */

/* A válasz HTTP-státusza, ha a hiba egyáltalán hordoz ilyet. A 401-es
   kiléptetés (contexts/auth.tsx) épül rá.

   Az `in` operátor a TypeScript egyik narrowing-eszköze: a `"response" in error`
   után a fordító már tudja, hogy az `error`-nak VAN ilyen mezője, tehát a
   következő sorban minden cast nélkül olvasható. A mező típusa `unknown` marad,
   ezért kell alatta a következő vizsgálat is. */
export function responseStatus(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null || !("response" in error)) return undefined;
    const response = error.response;
    if (typeof response !== "object" || response === null || !("status" in response)) return undefined;
    const status = response.status;
    return typeof status === "number" ? status : undefined;
}

/* A hiba EMBERNEK SZÓLÓ része, a naplózáshoz (log.ts). Sorrendben: amit a
   szerver a válasz törzsében küldött, különben a hiba saját üzenete (hálózati
   hiba esetén csak ez van), végül maga az érték — mert ha valaki egy sima
   szöveget dobott, azt is látni akarjuk.

   A null és az undefined egyaránt "nincs adat"-nak számít, ahogy az eredeti
   `??` lánc is kezelte őket. */
export function errorDetail(error: unknown): unknown {
    if (typeof error === "object" && error !== null) {
        if ("response" in error) {
            const response = error.response;
            if (typeof response === "object" && response !== null && "data" in response) {
                if (response.data !== undefined && response.data !== null) return response.data;
            }
        }
        if ("message" in error && error.message !== undefined && error.message !== null) return error.message;
    }
    return error;
}
