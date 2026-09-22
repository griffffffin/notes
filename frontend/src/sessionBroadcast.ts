/* LAPOK KÖZTI KIJELENTKEZÉS — ha az egyik lapon kilépünk, a többi lap is AZONNAL lépjen ki.

   MIÉRT KELL. A kijelentkezés a szerveren a fiók MINDEN munkamenetét visszavonja (a
   tokenVersion növelésével, backend controllers/Users/logout.js), tehát a többi lap
   munkamenete is halott — csak épp a KÖVETKEZŐ szerverkérésükig nem tudnak róla (akkor
   kapnak 401-et). Addig a már dekódolt tartalom kint marad a képernyőjükön. Ez a csatorna
   ezt a rést zárja: a kilépő lap szól a többinek, azok pedig azonnal eldobják a munkamenetet
   ÉS a mesterkulcsot.

   MIÉRT SZINKRON KIJELENTKEZÉS, ÉS NEM PUSZTA "ZÁROLÁS". Ha csak a kulcsot dobnánk el (a
   munkamenetet meghagyva), az itt kétszeresen is rossz volna: (1) a szerver-munkamenet már
   halott, tehát a lock-képernyőn hiába írná be valaki a jelszót — a feloldás sikerülne
   kliens-oldalról, de az első szerverkérés 401-gyel kidobná; (2) két, MÉG feloldott lap a
   zárolás után újra átadhatná egymásnak a kulcsot (masterKeySession peer-kérés/válasz), és
   a zárolás versenyhelyzetben visszafordulna. A teljes, szinkron kijelentkezés mindkettőt
   kizárja: a kijelentkezett lap se munkamenetet nem mutat, se kulcsot nem kér és nem ad.

   AZONOS ORIGIN, MEMÓRIÁBAN. Mint a masterKeySession csatornája: a böngésző azonos-origin
   lapjai közti jelzés; más gépre/eszközre NEM megy — azt a szerveroldali visszavonás fedi
   (a többi eszköz a következő kérésénél kap 401-et). KÜLÖN csatorna a mesterkulcsétól: az a
   kulcsot osztja meg (request/provide), ez a munkamenet végét jelzi — két külön természetű
   üzenet, két külön néven, hogy ne keveredjenek. */

const channel: BroadcastChannel | null =
    typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("notes-session");
/* A Node-beli (teszt) BroadcastChannel életben tartaná az eseményhurkot; ha van `unref`,
   elengedjük. A böngésző típusa ezt nem ismeri, ezért `unknown`-on át, VALÓDI futásidejű
   ellenőrzéssel nyúlunk hozzá (nincs `as`; a létezést a `typeof` dönti el — l. CLAUDE.md). */
if (channel) {
    const candidate: unknown = channel;
    if (typeof candidate === "object" && candidate !== null && "unref" in candidate
        && typeof candidate.unref === "function") candidate.unref();
}

/* A JELZÉS KÍVÜLRŐL JÖN (másik lap), ezért `unknown` — még ha a mi kódunk küldi is, egy XSS
   a mi originünkön hamis alakot posztolhatna. Valódi futásidejű ellenőrzés, mielőtt hatna. */
function isLogoutMessage(data: unknown): boolean {
    return typeof data === "object" && data !== null && "type" in data && data.type === "logout";
}

const listeners = new Set<() => void>();
if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>): void => {
        if (isLogoutMessage(event.data)) listeners.forEach((listener) => listener());
    };
}

// A kilépő lap szól a többinek. (A saját üzenetét egy csatorna-példány nem kapja vissza.)
export function broadcastLogout(): void {
    if (channel) channel.postMessage({type: "logout"});
}

/* Feliratkozás a MÁSIK lapon történt kijelentkezésre; a visszaadott függvény leiratkozik. A
   hívó (contexts/auth.tsx) ilyenkor dobja el a munkamenetet és a mesterkulcsot. */
export function subscribeRemoteLogout(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
