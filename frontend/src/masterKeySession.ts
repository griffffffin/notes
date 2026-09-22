/* A MESTERKULCS (MK) ÉLETCIKLUSA a bejelentkezett munkamenetben — a végpontok közötti
   titkosítás kliens-oldali szíve.

   MI EZ, ÉS MIÉRT CSAK A MEMÓRIÁBAN. Az MK-val titkosul minden szekció-tartalom
   (e2ee/content.ts). Kizárólag ebben a modul-szintű változóban él, a lap életére — sehol
   nem írjuk le, se sütibe, se localStorage-ba. Ha leírnánk, pontosan oda kerülne, ahonnan
   a titkosítás ki akarja emelni. Ugyanaz az elv, mint a piszkozat-kulcsnál (draftCrypto.ts).

   MIBEN MÁS, MINT A PISZKOZAT-KULCS. Azt a szerver adta, tehát reload után egy kéréssel
   pótolható volt. Az MK-t a szerver SOHA nem látja (ez az E2EE lényege): a kliens a
   JELSZÓBÓL származtatott kulccsal (KEK) csomagolja ki a szerver által tárolt `wrappedMk`-t.
   Ezért:
     - BELÉPÉSKOR a jelszó a kezünkben van (épp beírták) → azonnal feloldunk (`unlock`).
     - RELOAD/új lap után az MK eltűnik a memóriából, és a jelszó NINCS meg → a
       munkamenet-süti szerint "belépve", de "zárolt": a felület jelszót kér, és azzal
       oldunk fel. (A lock-képernyő és a bekötés az auth-rétegben; ez a modul a kulcsot és
       a zárolt/feloldott állapotot adja.)

   AZ ARGON2 ASZINKRON — ÉS ITT EZ RENDBEN VAN. A KDF (e2ee/masterKey.ts) egyszer fut,
   feloldáskor/regisztrációkor, nem minden mentésnél; a pagehide-ban futó tartalom-
   titkosítás a szinkron @noble AES-t használja (e2ee/content.ts), tehát a lapbezárás nem
   akad meg. */

import {useEffect, useState, useSyncExternalStore} from "react";
import {base64ToBytes, bytesToBase64} from "./e2ee/base64";
import {deriveKek, generateMasterKey, generateSalt, unwrapMasterKey, wrapMasterKey}
    from "./e2ee/masterKey";
import type {KdfParams} from "./e2ee/masterKey";
import type {Enrollment} from "./types/api";

/* A KDF ALAPÉRTELMEZETT PARAMÉTEREI — a regisztrációkor becsomagolt kulcshoz. MÉRVE a
   Pi-n (2026-09-18, ~közepes-telefon proxy): m=64 MiB, t=3, p=1 → ~1,2 s feloldás. A
   memória-keménység a fő GPU/ASIC-védelem; adott időből inkább memóriát veszünk. ⚠ A
   VÉGLEGES érték a valódi régi-telefon mérésen dől el (a feloldás reloadkor is fut) —
   nyitott tétel az E2EE.md-ben. Feloldáskor NEM ezt használjuk, hanem a fiókkal TÁROLT
   paramétereket (`enrollment.kdf`), hogy egy jövőbeli emelés a régi fiókokat ne törje. */
const DEFAULT_KDF: KdfParams = {memorySize: 65536, iterations: 3, parallelism: 1};

/* MODUL-SZINTŰ ÁLLAPOT + FELIRATKOZÁS — a `useSyncExternalStore` mintája, mint a
   draftKeySession.ts-ben. A kulcsot az auth-réteg szerzi/dobja, a "zárolt-e" kérdésre a
   fa mélyén ülő felület válaszol; a modul-szintű regiszter mindkettőt kiszolgálja.

   A TÍPUS KIMONDVA (`Uint8Array | null`), nem a kezdőértékből: `null`-ból a fordító
   `null`-ra szűkítené, és az első értékadás elhasalna (l. CLAUDE.md, "kezdőérték ≠ típus"). */
let masterKey: Uint8Array | null = null;
const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach((listener) => listener()); };
const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

// Van-e feloldott mesterkulcsunk? A felület ebből tudja: feloldva, vagy zárolt/kijelentkezve.
export const hasMasterKey = (): boolean => masterKey !== null;

/* A MESTERKULCS KIADÁSA a tartalom-titkosításnak (e2ee/content.ts hívói: a szekció
   mentés/olvasás útjai). DOB, ha zárolt — nyílt szöveget "vészmegoldásként" SOHA nem
   írunk; a hívó dolga, hogy zárolt állapotban ne is jusson idáig (a kapu a felületen). */
export function getMasterKey(): Uint8Array {
    if (masterKey === null)
        throw new Error("A mesterkulcs zárolva — nincs mivel titkosítani vagy visszafejteni.");
    return masterKey;
}

/* A KULCS ELDOBÁSA — kijelentkezéskor és felhasználó-váltáskor. Amíg a kulcs a
   memóriában van, addig ezen a lapon a mi kódunk visszafejthetné a tartalmat; a
   kijelentkezés azt jelenti, hogy innentől nem. (A felíratkozóknak SZÓLNI is kell, ezért
   emit — különben a felület zárolt állapotban is feloldottnak látszana.) */
export function clearMasterKey(): void {
    masterKey = null;
    emit();
}

/* ─── LAPOK KÖZTI KULCS-MEGOSZTÁS (BroadcastChannel) ────────────────────────────────
   Cél: egy ÚJ lap (vagy egy frissítés) NE kérjen újra jelszót, ha egy MÁSIK lapon már
   fel van oldva a munkamenet.

   MIÉRT BroadcastChannel, ÉS MIÉRT NEM localStorage/sessionStorage. Az MK-t SOHA nem
   írjuk lemezre (l. a fájl eleji kommentet) — a localStorage épp ezt tenné, és lemezre
   került kulcs meg is maradna a böngésző bezárása után (megtörné a nyugalmi E2EE-t). A
   sessionStorage laponként KÜLÖN van, tehát egy frissen nyitott lap üresen indulna, nem
   örökölne. A BroadcastChannel viszont az azonos origin lapjai közti, MEMÓRIÁBAN élő
   üzenetcsatorna: a zárolt lap megkérdezi a többit, egy feloldott lap pedig átadja neki a
   kulcsot. A kulcs így végig csak a memóriában utazik. Ha MINDEN lap bezárul, a kulcs
   eltűnik, és a legközelebbi megnyitás megint jelszót kér — ez a szándékos határ (a user
   döntése, 2026-09-18).

   FENYEGETÉSMODELL. A csatorna azonos originre korlátozott (a böngésző kényszeríti ki).
   XSS esetén egy támadó a mi originünkön elkérhetné a kulcsot egy feloldott laptól — de az
   XSS a saját lapja memóriájában amúgy is elérné az MK-t, tehát ez nem ad érdemi új
   felületet (ugyanaz az elv, amiért az XSS az E2EE-t általában is megtöri; E2EE.md 1.). */

type ChannelMessage = {type: "request"} | {type: "provide"; mk: string};

/* Feature-detektálás: ahol a BroadcastChannel nem elérhető (régi böngésző), a megosztás
   egyszerűen kimarad — a lap a lock-képernyőre esik vissza, nem hibázik. */
const channel: BroadcastChannel | null =
    typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("e2ee-master-key");
/* A Node-beli (teszt) BroadcastChannel életben tartaná az eseményhurkot; ha van `unref`,
   elengedjük. A böngésző típusa ezt a metódust nem ismeri, ezért `unknown`-on át, VALÓDI
   futásidejű ellenőrzéssel nyúlunk hozzá (nincs `as`; a létezést a `typeof` dönti el). */
if (channel) {
    const candidate: unknown = channel;
    if (typeof candidate === "object" && candidate !== null && "unref" in candidate
        && typeof candidate.unref === "function") candidate.unref();
}

/* AZ ÜZENET KÍVÜLRŐL JÖN (másik lap), ezért `unknown` — még ha a mi kódunk küldi is, egy
   XSS a mi originünkön hamis alakot posztolhatna. Valódi futásidejű ellenőrzés szűkíti,
   mielőtt hozzányúlnánk (l. CLAUDE.md, "ami kívülről jön, az unknown"; httpError.ts minta). */
function parseChannelMessage(data: unknown): ChannelMessage | null {
    if (typeof data !== "object" || data === null || !("type" in data)) return null;
    if (data.type === "request") return {type: "request"};
    if (data.type === "provide" && "mk" in data && typeof data.mk === "string")
        return {type: "provide", mk: data.mk};
    return null;
}

/* A KULCS ÁTVÉTELE egy másik laptól. CSAK ha most zárolva vagyunk: egy már feloldott lap
   saját kulcsát nem írjuk felül (az a mérvadó, és felül sem KELL írni — minden lap
   ugyanazé a felhasználóé, hisz egy munkamenet-süti van). */
function adoptMasterKey(bytes: Uint8Array): void {
    if (masterKey !== null) return;
    masterKey = bytes;
    emit();
}

// A saját (feloldott) kulcs felajánlása a többi lapnak — feloldáskor és kérésre.
function announceMasterKey(): void {
    if (channel && masterKey !== null)
        channel.postMessage({type: "provide", mk: bytesToBase64(masterKey)});
}

if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>): void => {
        const message = parseChannelMessage(event.data);
        if (!message) return;
        // Egy zárolt lap kérdez: ha nálunk fel van oldva, átadjuk. Zárolva HALLGATUNK —
        // egy "nincs kulcsom" válasz csak zajt adna, és felfedné a lap zárolt állapotát.
        if (message.type === "request") return announceMasterKey();
        // Egy feloldott lap átadta a kulcsot — ha zárolva vagyunk, átvesszük.
        adoptMasterKey(base64ToBytes(message.mk));
    };
}

/* A ZÁROLT LAP KÉRÉSE a többi laphoz. A választ (provide) az onmessage kezeli: ha megjön,
   beállítja a kulcsot és értesíti a felíratkozókat, mire a felület átvált a feloldott
   nézetre — jelszó nélkül. Ha senki nem válaszol, a hívó (usePeerUnlockAttempt) idővel
   feladja, és jöhet a lock-képernyő. */
export function requestMasterKeyFromPeers(): void {
    if (channel) channel.postMessage({type: "request"});
}

/* REGISZTRÁCIÓ: friss MK + friss salt, a jelszóból KEK, az MK becsomagolása. A friss
   munkamenet FELOLDVA indul (az MK a memóriába kerül), és VISSZAADJUK a beiratkozást,
   amit a hívó (regisztrációs űrlap) a szervernek küld (POST /user/create). A szerver az
   MK-t és a jelszót SOHA nem látja — csak a becsomagolt alakot.

   A `kdf` paraméterezhető (alapból DEFAULT_KDF) — így a tesztek gyors, kicsi paraméterrel
   futnak; éles hívó nem adja meg. */
export async function enroll(password: string, kdf: KdfParams = DEFAULT_KDF): Promise<Enrollment> {
    const mk = generateMasterKey();
    const salt = generateSalt();
    const kek = await deriveKek(password, salt, kdf);
    const wrappedMk = wrapMasterKey(kek, mk);
    masterKey = mk;
    emit();
    // A friss kulcsot a többi (esetleg zárolt) lap is átveheti — l. announceMasterKey.
    announceMasterKey();
    return {
        wrappedMk,
        kdfSalt: bytesToBase64(salt),
        kdf: {
            algorithm: "argon2id",
            memorySize: kdf.memorySize,
            iterations: kdf.iterations,
            parallelism: kdf.parallelism,
        },
    };
}

/* FELOLDÁS: a beírt jelszóból + a fiókkal tárolt beiratkozásból kicsomagolja az MK-t. A
   KEK-et a TÁROLT paraméterekkel (`enrollment.kdf`) és sóval számoljuk — nem a mai
   alapértékkel —, hogy a régi fiókok a saját beállításukkal oldódjanak fel. ROSSZ
   jelszónál a `unwrapMasterKey` DOB (a GCM-címke nem stimmel): ez maga a jelszó-
   ellenőrzés a kliensen, a hívó fordítja "hibás jelszó" üzenetté. */
export async function unlock(password: string, enrollment: Enrollment): Promise<void> {
    const salt = base64ToBytes(enrollment.kdfSalt);
    const kek = await deriveKek(password, salt, enrollment.kdf);
    masterKey = unwrapMasterKey(kek, enrollment.wrappedMk);
    emit();
    // A feloldott kulcsot a többi, még zárolt lap is átveheti — l. announceMasterKey.
    announceMasterKey();
}

/* A ZÁROLT/FELOLDOTT ÁLLAPOT OLVASÁSA a felületnek. A `useSyncExternalStore` gondoskodik
   róla, hogy a kulcs megérkezésekor/eldobásakor a komponens újrarajzolódjon. */
export const useMasterKeyStatus = (): boolean =>
    useSyncExternalStore(subscribe, hasMasterKey);

/* A LAPOK KÖZTI FELOLDÁS-KÍSÉRLET a lock-képernyő ELŐTT. Amikor a lap zárolt (belépve, de
   nincs kulcs), NEM ugrunk azonnal a jelszó-kérésre: előbb megkérdezzük a többi lapot
   (requestMasterKeyFromPeers). Ha egy feloldott lap válaszol, a kulcs megérkezik
   (onmessage → adoptMasterKey → emit), a `hasMasterKey` átbillen, és a hívó tovább a
   Routes-ra vált — jelszó nélkül. Ha az időkorláton belül SENKI nem válaszol, feladjuk, és
   a hívó a lock-képernyőt mutatja.

   Visszaadja: FUT-E MÉG a kísérlet. A hívó ez alatt karikát mutat (nem a lock-képernyőt),
   így a gyakori esetben (van feloldott lap, ~1 ms válasz) a jelszó-kérdés fel sem villan.
   A "van feloldott lap"-esetnél a kulcs jóval a határidő előtt megérkezik; a teljes
   várakozást csak a MAGÁNYOS eset (nincs más lap) fizeti meg. */
const PEER_UNLOCK_TIMEOUT_MS = 300;

export function usePeerUnlockAttempt(isLocked: boolean): boolean {
    const [isAsking, setIsAsking] = useState(isLocked);
    useEffect(() => {
        if (!isLocked) { setIsAsking(false); return; }
        setIsAsking(true);
        requestMasterKeyFromPeers();
        const timer = setTimeout(() => setIsAsking(false), PEER_UNLOCK_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, [isLocked]);
    return isAsking;
}
