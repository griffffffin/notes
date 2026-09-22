/* A BEIRATKOZÁS KIVÉTELE A NAPI MENTÉSHEZ — hogy a mentés ÖNMAGÁBAN visszafejthető legyen
   (a decrypt-export.js bemenete). Ez az [[offline-restorable-backups]] „app nélkül is
   visszaállítható" ígéretének a kulcs-fele: a szekció-fájlokban a `ciphertext` van, a
   feloldáshoz kellő beiratkozás (wrappedMk + kdfSalt + kdf) viszont a `users` táblában ül,
   amit a napi export SZÁNDÉKOSAN kihagy (a jelszó-hash ÉS a draftKey miatt, l. models/users.js).

   MIÉRT NEM GYENGÍTI EZ AZ E2EE-T. A tartalom a JELSZÓBÓL származó kulccsal (KEK → MK) van
   titkosítva; a jelszó SEHOL nincs a szerveren vagy az exportban. A `wrappedMk` a jelszó
   nélkül értelmezhetetlen — tehát a beiratkozás kiadása NEM enged senkit más adatához a
   jelszava nélkül. A beiratkozás „nem titok"; a titok a jelszó. (A szerver-vakság garanciája:
   E2EE.md 3.)

   SEBÉSZI WHITELIST. Pontosan három mező megy ki, explicit felsorolással — a `password`
   (hash), a `draftKey` (maga a piszkozat-titok!), a `tokenVersion`, a `name` és a `createdAt`
   SOHA. Nem a nyers user-dokumentumot szűrjük (az tömeges-értékadás volna, CLAUDE.md), hanem
   a három mezőt vesszük ki név szerint. A kaput az exportEnrollment.test.js szivárgás-tesztje
   őrzi (alakra illesztve, mint a szerver-vakság session.test.js-e).

   A wrappedMk BORSOZVA marad (a tárolt "pepper1…" alak, e2ee/pepper.js): egy kiszivárgott
   enrollment.json ÖNMAGÁBAN (az E2EE_PEPPER nélkül) nem törhető offline gyenge jelszónál sem.
   A bors leszedését a decrypt-export.js maga végzi (a "pepper1…" előtagot felismeri). */
const {pickKdf} = require("../src/e2ee/enrollment");

/* Egy user-dokumentumból a mentendő beiratkozás-rekord, vagy `null`, ha a fiók nincs
   E2EE-beiratkozva (nincs wrappedMk/kdf — régi, E2EE előtti fiók). A `null` a hívónak azt
   jelenti: nincs mit menteni, ne írjon üres/félkész fájlt. */
function enrollmentRecord(user) {
    if (!user?.wrappedMk || !user?.kdf) return null;
    return {
        wrappedMk: user.wrappedMk,   // NYERS, borsozott tárolt alak — a borsot NEM szedjük le itt
        kdfSalt: user.kdfSalt,
        kdf: pickKdf(user.kdf),
    };
}

module.exports = {enrollmentRecord};
