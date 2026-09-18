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

import {useSyncExternalStore} from "react";
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
}

/* A ZÁROLT/FELOLDOTT ÁLLAPOT OLVASÁSA a felületnek. A `useSyncExternalStore` gondoskodik
   róla, hogy a kulcs megérkezésekor/eldobásakor a komponens újrarajzolódjon. */
export const useMasterKeyStatus = (): boolean =>
    useSyncExternalStore(subscribe, hasMasterKey);
