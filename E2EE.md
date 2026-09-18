# E2EE — végpontok közötti titkosítás terve

A tartalom (jegyzet, idézet, film, to-do…) úgy tárolódjon a szerveren, hogy a
**szerver a nyílt szöveget soha ne lássa**. Ez a `notes` „megfigyelés-mentes"
pozicionálásának belépője (l. a `product-positioning` memória). Ez a dokumentum a
megvalósítás terve; a fázisok külön menetekben, teszttel és mutáció-próbával mennek.

> **Állapot:** TERVEZÉS. A kriptó-mag megépítése jöhet most; az **élesítés a HTTPS-en
> múlik** (l. lent), de a HTTPS ingyenes, nem a fizetős domainen. Semmi nincs még
> implementálva ebből.

## 1. Fenyegetésmodell — mit ad hozzá, mit NEM

**Amit a mai állapot már fed** (nem itt oldjuk meg): a *kikapcsolt* gépről ellopott
lemez (LUKS), a hálózati lehallgatás (a HTTPS után), az XSS (CSP + HttpOnly token), a
kliens lemezén fekvő piszkozat (piszkozat-titkosítás).

**Amit az E2EE tesz hozzá:** a **futó szerver** és a **szerver-oldali szivárgás** (DB-dump,
VPS-szolgáltató memória-hozzáférése) ellen véd. Ezután a szerver csak **titkosított blobot
+ nyílt metaadatot** lát.

**Amit az E2EE NEM fed, és ki kell mondani:**
- **Metaadat-szivárgás** — a szerver látja a szekciónkénti elemszámot, az
  `updatedAt`-időbélyegeket és a sorrend-pozíciókat (l. 4. szakasz). Ez durva mintázat,
  soha nem tartalom, de mintázat.
- **Jelszóvesztés = TELJES adatvesztés.** Nincs helyreállító kulcs (a user döntése,
  2026-09-18). A jelszó az egyetlen út a mesterkulcshoz — ha elveszik, a tartalom
  visszafejthetetlen. ⚠ A **termék indulása előtt újra kell nézni** (fizető ügyfélnél ez
  support-katasztrófa és lemorzsolódás).
- **Kliens-oldali kompromittálás** (XSS, rosszindulatú kiterjesztés) — az XSS a
  memóriában élő mesterkulcsot úgyis látja. Ezért kötelező a HTTPS (kód-integritás) és a
  szigorú CSP (már él).

## 2. Élesítés-előfeltétel: HTTPS (ingyen), NEM a fizetős domain

Az E2EE HTTP-n **díszlet**: egy aktív MITM nem a titkosítást töri, hanem **kicseréli a
titkosító JS-t**, és az kiküldi neki a kulcsot/nyílt szöveget. Ezért a HTTPS (biztonságos
kontextus) az élesítés kemény feltétele.

**De a HTTPS ingyen megvan a fizetős domain előtt:** ingyenes aldomain
(deSEC.io `*.dedyn.io` vagy DuckDNS) + Let's Encrypt **DNS-01** kihívással. A DNS-01 csak
azt bizonyítja, hogy miénk a név (ideiglenes TXT-rekord), **portot nem nyit**; az `A`
rekord a szerver WireGuard-címére mutat, tehát az elérés VPN-only marad, a böngésző
mégis biztonságos kontextust lát. **A fizetős, márkás domain a termék legvégső lépése.**
(Részletek: `token-cookie-hardening` memória.)

## 3. Kulcs-hierarchia — a terv szíve

Három szint, a bevett minta (Proton, Standard Notes). Ez oldja fel a passkey-ütközést és
teszi olcsóvá a hitelesítés-cserét.

| Szint | Mi ez | Hol él | Ki látja |
|------|-------|--------|----------|
| **MK** (master key) | 32 bájt véletlen; ezzel titkosul MINDEN tartalom | csak a kliens memóriájában, feloldás után | soha senki más |
| **KEK** (key-encryption key) | `Argon2id(jelszó, salt)` | pillanatnyilag a kliensen | senki |
| **wrapped-MK** | `AES-256-GCM(KEK, MK)` | a szerveren, a user-rekordban | a szerver — de csak a *becsomagolt* alakot |

**Fogalmak:**
- **KDF** — jelszóból (kitalálható) csinál kulcsot úgy, hogy lassú és memória-igényes
  legyen. Ez az **Argon2id** (a KLIENSEN, WASM-mel — `hash-wasm`). Ez más, mint a
  szerveroldali argon2id jelszó-hash: az hitelesít, ez kulcsot származtat.
- **AEAD** — titkosítás, ami hitelesít is (a `decrypt` hibát dob, ha a ciphertexthez
  nyúltak). Ez az **AES-256-GCM**, a `@noble/ciphers`-ből — MÁR a bundle-ben a
  piszkozat-menetből, tehát a tartalom-titkosítás nem hoz új függőséget, csak a KDF.

**Regisztráció:** a kliens generál egy véletlen MK-t, a jelszóból Argon2id-vel KEK-et
számol, és a szervernek CSAK a `wrapped-MK`-t + a saltot + az Argon2-paramétereket küldi.
A szerver az MK-t és a jelszót soha nem látja.

**Belépés (feloldás):** a szerver visszaadja a `wrapped-MK`-t + saltot; a kliens a beírt
jelszóból újra KEK-et számol, kicsomagolja az MK-t, és **memóriában tartja** (modul-szintű
változó, mint ma a piszkozat-kulcs). Rossz jelszó → a GCM-kicsomagolás hibát dob →
„hibás jelszó" (a szervernek nem kell tudnia; a szerveroldali argon2id-hash a hitelesítés,
az MK-kicsomagolás ettől független).

**Miért old ez fel mindent:**
- **Passkey** (később, `session-revocation-plan` 5.): egy MÁSODIK `wrapped-MK`, a WebAuthn
  PRF-titokból származtatott KEK-kel. Ugyanaz az MK, párhuzamos becsomagolás — nincs
  újratitkosítás. Ezért marad az MK-indirekció akkor is, ha most nincs jelszóváltás.
- **Jelszóváltás** (ma nincs, de ha lesz): csak az MK-t csomagoljuk újra az új KEK-kel, a
  **tartalmat nem** kell újratitkosítani.

## 4. Boríték-séma — a drágán visszavonható döntés

Ezt az éles, már titkosított adaton migrálni drága → most kell eldönteni, amíg a DB kicsi.
Elv: **a lehető legkevesebb maradjon nyílt, de ne törjön funkció, és ne csináljunk
fölösleges bonyolítást.**

**Séma (idézet-példa; a többi szekció analóg):**

```
{
  _id,          // NYÍLT — kulcs; a kliens adja (createOnce már így megy); tartalmat nem árul
  user,         // NYÍLT — tulajdon (a többbérlős szűrők ezen mennek)
  section,      // NYÍLT — melyik collection (a szekció-per-collection architektúra kell)
  order,        // NYÍLT — sorrend/lapozás-horgony
  updatedAt,    // NYÍLT — a delta-szinkron ezen múlik
  nonce,        // NYÍLT — a GCM IV-je (nem titok, de egyedi KELL)
  ciphertext,   // TITKOS — { quote, author, fontSize, createdAt, category/genre, taskOrder… }
}
```

**Miért pont ez a nyílt halmaz — build-drága vs. működés-drága szűrővel** (a user elve,
2026-09-18: ha csak elkészítésben drága elrejteni, de működésben nem, akkor rejtsük el):

- **`createdAt` → a blobba** (elrejtése INGYEN, csak megjelenítés kell hozzá). Nem marad
  nyílt oszlop.
- **`fontSize`, `category`/`genre`, `taskOrder`, minden tartalmi/megjelenítési mező → a
  blobba.** A `genre`/`category` eddig szerver-oldali szűrő volt (`/movies/comedy`) — ez a
  kliensre költözik a keresés-menettel (F3), ott úgyis dekódolt halmazon szűrünk.
- **`updatedAt` → NYÍLT, mert MŰKÖDÉS-drága elrejteni.** A delta-szinkron („mi változott X
  óta") ezen áll; elrejtve minden szinkron a TELJES halmazt letöltené (mobilon, 10k
  elemnél fájó). Ez nem kényelmi k, hanem funkcionális kényszer.
- **Szekciónkénti elemszám → NYÍLT, mert build ÉS működés-drága elrejteni.** Elrejtéséhez
  a szekció-per-collection architektúrát kellene feladni (közös tábla, titkosított
  szekció-címke) VAGY dummy-sorokkal padolni — az utóbbi örökre hízik és szinkronizál.
  Aránytalan.
- **`order` → NYÍLT, alacsony érzékenység.** Elrejtése olcsó build volna, de a kliens
  úgyis helyben rendez, a privátsági nyereség ~0, cserébe kell egy másik nyílt
  lapozás-horgony → fölösleges bonyolítás. Marad nyílt.

**Elfogadott, a fenyegetésmodellben PUBLIKÁLANDÓ szivárgás:** szekciónkénti elemszám +
`updatedAt`-időbélyegek + `order`-pozíciók. Durva mintázat (mennyit, mikor), **soha nem
tartalom**.

**Két kriptó-részlet, teszttel őrizve:**
- **Egyedi nonce** minden titkosításnál (`crypto.getRandomValues`, 96 bit). GCM-nél az IV
  ismétlődése katasztrófa (kiszivárogtatja a hitelesítő kulcsot) — a piszkozat-menetben
  már van rá teszt-minta.
- **AAD (additional authenticated data): `_id` + `section` + `user`.** Ez a helyéhez köti a
  ciphertextet: a szerver nem cserélheti ki két elem blobját (swap-támadás) anélkül, hogy a
  `decrypt` el ne hasalna. E2EE-nél a szerver ELLENSÉGES — ezt teszt bizonyítja.

## 5. Feloldás-életciklus és a RELOAD-probléma (fontos)

A HttpOnly-token menet (kész, `a4774fc`) óta a JS nem tart tartós titkot: a
munkamenetet a szerver-oldali süti tartja, a kliens a piszkozat-kulcsot ma RELOAD után a
szerverről újra-lekéri. **E2EE-nél a szerver az MK-t nem ismeri**, tehát reload / új lap
után az MK eltűnik a memóriából, és **nem pótolható a szerverről** → a felhasználónak
**újra be kell írnia a jelszót a feloldáshoz**.

Ez egy új állapotot hoz: a süti szerint „belépve", de a tartalom „zárolt" (nincs MK) →
kell egy **lock-képernyő**. Ez az E2EE inherens ára a jelenlegi modellben.

- **Ajánlott alapérték: re-prompt** a jelszóra reloadkor (Standard Notes-minta, a
  legbiztonságosabb).
- **Gyengébb-de-simább alternatíva:** az MK a `sessionStorage`-ban (tab-élettartamig él,
  tab-zárásnál törlődik). Kevésbé biztonságos, de reloadnál nem kérdez.
- ⬜ **Nyitott UX-kérdés** — a két opció közti választás.

## 6. Keresés és szűrés → kliens-oldal (F3, KÜLÖN menet, de ELŐFELTÉTEL)

Az E2EE megöli a szerveroldali keresést/szűrést (`readSearch`, `readSearchMode`,
`readAuthors`, és a genre/category-szűrés is) — a szerver titkosított blobot lát. Ezek a
kliensre költöznek: **FlexSearch/MiniSearch + IndexedDB**, chunkolt első szinkron + delta-
szinkron. Külön menet (sok mérendő ismeretlen, l. `list-search-scaling` memória), **de az
élesítés előfeltétele** — a user kérte, hogy „a többi funkció is működjön". Vagyis: az
E2EE-t nem kapcsoljuk be, amíg a kliens-oldali keresés/szűrés nincs kész.

## 7. Mentés app nélkül is olvasható (kemény követelmény)

E2EE mellett a szerver nem tud nyílt exportot adni (nincs kulcsa). Szállítandó
(`offline-restorable-backups` memória):
1. **Önálló `backend/scripts/decrypt-export.js`** — nyers Node; bemenet: mentés-fájl +
   kulcs, kimenet: nyílt JSON/CSV. Se böngésző, se szerver, se app.
2. A napi export a laptopon, a lehúzó szkriptben fejtődik vissza (ott a kulcs úgyis van)
   → a titkosított lemezen nyílt JSON fekszik, ahogy a követelmény kéri.
3. **Kör-teszt:** titkosított mentés → szkript → ugyanaz a tartalom. Enélkül a „vissza
   lehet állítani" hit, nem tény.

⚠ Feszültség a „nincs helyreállító kulcs" döntéssel: a `decrypt-export.js`-nek is kell
kulcs. Mivel nincs külön helyreállító kulcs, ez a **jelszóból származtatott KEK →
wrapped-MK → MK** úton megy (a szkript is Argon2id-t futtat a megadott jelszóval). Tehát a
mentés visszafejtéséhez a jelszó kell — összhangban a „jelszó az egyetlen út" döntéssel.

## 8. A piszkozat-titkosítás beolvad

A mai `draftKey` (szerver-adta véletlen, nyíltan a DB-ben — a „0. tétel", a legmélyebb
rés) **megszűnik**: a piszkozat-kulcs az MK-ból származik (HKDF-fel egy al-kulcs). Ezzel a
nyílt-kulcs-rés gyökeresen megoldódik, nem foltként. A `draftCrypto.ts` AES-GCM-je marad,
csak a kulcs forrása változik. → A külön `draftKey` boríték-titkosítás (0a) tárgytalanná
válik, nem kell megcsinálni.

## 9. Fázisok és sorrend

- **F1 — kriptó-mag** (most, élesítés nélkül): kulcs-hierarchia (MK/KEK/wrapped-MK),
  Argon2id-WASM a kliensen, regisztráció/belépés/feloldás átírása, lock-képernyő,
  boríték-séma a modelleken, AEAD + AAD + egyedi nonce. Mérés külön, loopback
  Express-példányon (a `notes.service`-hez nem nyúlunk).
- **F2 — mentés-visszafejtő** (`decrypt-export.js`) + kör-teszt.
- **F3 — kliens-index + keresés/szűrés + chunk/delta szinkron** (külön menet, a mérendő
  kérdésekkel; az élesítés előfeltétele).
- **HTTPS** — ingyenes aldomain + Let's Encrypt DNS-01 (bármikor, párhuzamosan).
- **F4 — élesítés:** F1 + F3 + HTTPS megléte után; globális kiléptetés + a saját (kicsi)
  adat migrációja: tiszta újraregisztráció VAGY egyszeri kliens-oldali migráció.

## 10. Tesztstratégia

- **Kör-teszt:** titkosít → szerverre ment → visszaolvas → dekódol → ugyanaz.
- **Nonce-egyediség:** két egymás utáni titkosítás IV-je eltér (mutáció-próbával).
- **AAD-swap elutasítás:** más `_id`/`user` alá tett blob dekódolása HIBÁT dob.
- **Rossz jelszó:** a wrapped-MK kicsomagolása hibát dob, nem ad ki fél-adatot.
- **A szerver-vakság szerződés-tesztje:** a `/login`/`/refresh`/lista-válaszokban NINCS
  nyílt tartalmi mező (alakra illesztve, nem mezőnévre) — a mai `session.test.js` mintája.
- Minden új `if`/kapu MUTÁCIÓ-PRÓBÁVAL (a pontos tesztje bukjon a kivételére).

## 11. Nyitott / mérendő kérdések

- ⬜ Reload-UX: re-prompt vs. `sessionStorage`-MK (5. szakasz).
- ⬜ Argon2id-paraméterek a KLIENSEN (memória/iteráció) — a szerveroldalitól eltér, mert a
  leggyengébb kliens-eszközön (régi telefon) is elviselhető kell legyen; MÉRENDŐ.
- ⬜ Bundle-hatás: `hash-wasm` mérete (a valibot/@noble mérés-mintája szerint).
- ⬜ Migráció F4-nél: újraregisztráció vs. kliens-oldali migráció.
- ⬜ Termék előtt újranézni: helyreállító kulcs hiánya (jelszóvesztés = teljes adatvesztés).
- ⬜ F3 saját nyitott kérdései (l. `list-search-scaling` memória): „10k ≈ 10 MB" tartja-e,
  mobil eviction, substring vs. token-keresés.
