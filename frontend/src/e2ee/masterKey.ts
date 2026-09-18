/* A KULCS-HIERARCHIA — az E2EE szíve. Három szint, a bevett minta (Proton, Standard
   Notes). A részletek: E2EE.md 3. szakasz.

   MK  (master key)   32 bájt véletlen; EZZEL titkosul minden tartalom. Csak a kliens
                      memóriájában él, feloldás után. Senki más nem látja.
   KEK (key-enc key)  Argon2id(jelszó, salt); a KEK csomagolja be az MK-t. Pillanatnyi.
   wrapped-MK         AES-GCM(KEK, MK); EZT tárolja a szerver a user-rekordban. A szerver
                      az MK-t és a jelszót SOHA nem látja.

   MIÉRT EZ A HÁROM SZINT, ÉS NEM „a jelszóból közvetlenül a tartalom-kulcs". Mert így a
   jelszó csak a KEK-et adja, az MK tőle független. Két nyeresége van, mindkettő a
   projekt jövőbeli tétele: (1) PASSKEY — később egy MÁSODIK wrapped-MK készül a passkey
   PRF-titkából, UGYANAHHOZ az MK-hoz, tehát a tartalmat nem kell újratitkosítani; (2)
   JELSZÓVÁLTÁS (ma nincs) — csak az MK-t csomagolnánk újra, a tartalmat nem. Ezért marad
   az indirekció akkor is, ha most egyetlen becsomagolás (a jelszavas) létezik.

   ⚠ NINCS HELYREÁLLÍTÓ KULCS (a felhasználó döntése): a jelszó az EGYETLEN út az MK-hoz.
   Jelszóvesztés = teljes adatvesztés, menekülőút nélkül. A termék indulása előtt ezt
   újra kell nézni (l. E2EE.md). */

import {argon2id} from "hash-wasm";
import {seal, open} from "./aead";

// AES-256: az MK és a KEK is pontosan 32 bájt.
const KEY_BYTES = 32;

/* A SALT hossza. A salt nem titok (a wrapped-MK mellett, nyíltan tároljuk), a szerepe,
   hogy két azonos jelszó NE ugyanazt a KEK-et adja, és hogy egy előre számolt szivárvány-
   tábla használhatatlan legyen. 16 véletlen bájt bőven elég. */
const SALT_BYTES = 16;

/* A KDF-PARAMÉTEREK. Ezeket a wrapped-MK MELLETT, a szerveren tároljuk (a salttal
   együtt) — mert a felhasználó KEK-jét pontosan ezekkel kell újraszámolni feloldáskor.
   Így egy jövőbeli, erősebb alapérték a RÉGI fiókokat nem töri: mindenki a saját, tárolt
   paramétereivel oldódik fel, és a paraméter-emelés fokozatosan (feloldáskori
   újracsomagolással) átvezethető.

   A tervezett alapérték MÉRVE a Pi-n (2026-09-18, ~közepes-telefon proxy): m=64 MiB
   (65536), t=3, p=1 → ~1,2 s. A memória-keménység a fő GPU/ASIC-védelem, ezért adott
   időből inkább memóriát veszünk, mint iterációt. ⚠ A VÉGLEGES érték a valódi régi-telefon
   mérésen dől el (a feloldás reloadkor is fut, ne legyen elviselhetetlen) — nyitott tétel
   az E2EE.md-ben. Magát az `alapértéket` majd a regisztrációs út (F1b) rögzíti, amikor
   ténylegesen származtat vele — addig fölösleges, nem használt konstansként ne álljon itt. */
export interface KdfParams {
    memorySize: number; // kibibájt (1024 bájt)
    iterations: number;
    parallelism: number;
}

// Friss véletlen mesterkulcs — regisztrációkor, egyszer. A kliensen születik; a szerver
// sosem látja nyíltan.
export const generateMasterKey = (): Uint8Array =>
    crypto.getRandomValues(new Uint8Array(KEY_BYTES));

// Friss véletlen salt — szintén regisztrációkor, a jelszóhoz.
export const generateSalt = (): Uint8Array =>
    crypto.getRandomValues(new Uint8Array(SALT_BYTES));

/* A KEK LEVEZETÉSE a jelszóból, Argon2id-vel (hash-wasm, WASM). Aszinkron — de ez itt
   rendben van: a KDF feloldáskor/belépéskor fut EGYSZER, nem minden mentésnél (a
   pagehide-ban futó tartalom-titkosítás a szinkron @noble AES-t használja, l. content.ts).
   A kimenet nyers 32 bájt (`outputType: "binary"`), nem az „encoded" jelszó-hash alak —
   nekünk kulcs kell, nem ellenőrizhető hash. */
export async function deriveKek(
    password: string,
    salt: Uint8Array,
    params: KdfParams,
): Promise<Uint8Array> {
    return argon2id({
        password,
        salt,
        memorySize: params.memorySize,
        iterations: params.iterations,
        parallelism: params.parallelism,
        hashLength: KEY_BYTES,
        outputType: "binary",
    });
}

/* AZ MK BECSOMAGOLÁSA a KEK-kel. AAD NÉLKÜL: a wrapped-MK a saját user-rekordján ül,
   nincs másik hely, amivel összekeverhetnék — a „rossz jelszó" jelzést a GCM-címke
   adja (l. unwrap). */
export const wrapMasterKey = (kek: Uint8Array, masterKey: Uint8Array): string =>
    seal(kek, masterKey);

/* AZ MK KICSOMAGOLÁSA. Ha a KEK rossz (rossz jelszó), a GCM-címke nem stimmel, és az
   `open` DOB — ez maga a jelszó-ellenőrzés a kliens oldalán. A hibát NEM nyeljük el; a
   hívó (feloldás-folyamat) fordítja „hibás jelszó" üzenetté. A hossz-ellenőrzés
   másodlagos védvonal: egy elrontott, de véletlenül átmenő boríték se adjon rossz
   hosszú kulcsot a tartalom-titkosításnak. */
export function unwrapMasterKey(kek: Uint8Array, wrapped: string): Uint8Array {
    const masterKey = open(kek, wrapped);
    if (masterKey.length !== KEY_BYTES)
        throw new Error("A kicsomagolt mesterkulcs hossza hibás.");
    return masterKey;
}
