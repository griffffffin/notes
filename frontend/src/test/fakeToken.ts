/* VALÓDI ALAKÚ (de aláíratlan) TOKEN a tesztekhez.

   A tesztek eddig „teszt-token" alakú szövegeket adtak oda a sütinek és a
   bejelentkezés válaszának. Ez addig működött, amíg a kódot nem érdekelte, mi van
   a tokenben — most viszont a szerződés (types/api.ts) megköveteli, hogy az érték
   tényleg JWT legyen: három base64url rész, a középsőben a szerver állításaival.
   Egy pótlék akkor ér valamit, ha a VALÓSÁG helyett áll be — ez a segéd tehát nem
   a tesztek kedvéért lazítja a szabályt, hanem betartja.

   AMI SZÁNDÉKOSAN HAMIS BENNE: az aláírás. Azt a szerver titkával kellene
   számolni, és a frontend úgysem ellenőrzi (nem is tudná) — a kliens oldalán az
   aláírás egy átlátszatlan szövegdarab. A tesztek így nem kapnak titkot, és nem
   is kell hozzá jsonwebtoken-függőség a frontendben. */

// base64url: a base64 URL-barát változata — "+" helyett "-", "/" helyett "_", a
// kitöltő "=" jelek nélkül. Pontosan így kódol a jsonwebtoken is.
const base64url = (value: object): string =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/* A token élettartama itt csak azért van, hogy az `exp` állítás létezzen és szám
   legyen — a lejáratot sem a frontend, sem ez a segéd nem érvényesíti (az
   indoklás a types/api.ts-ben). */
const TTL_SECONDS = 15 * 60;

export function fakeToken(id = "u-1"): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = base64url({alg: "HS256", typ: "JWT"});
    const claims = base64url({id, iat: issuedAt, exp: issuedAt + TTL_SECONDS});
    return `${header}.${claims}.hamis-alairas`;
}
