# E2EE — végpontok közötti titkosítás terve

A tartalom (jegyzet, idézet, film, to-do…) úgy tárolódjon a szerveren, hogy a
**szerver a nyílt szöveget soha ne lássa**. Ez a `notes` „megfigyelés-mentes"
pozicionálásának belépője (l. a `product-positioning` memória). Ez a dokumentum a
megvalósítás terve; a fázisok külön menetekben, teszttel és mutáció-próbával mennek.

> **Állapot:** F1 (kriptó-mag, beiratkozás/feloldás, quotes-boríték) és F2 (offline
> mentés-visszafejtő + beiratkozás-mentés) KÉSZ és commitolva, NEM élesítve. F3 (6.
> szakasz): terv mérésekkel, MINDEN döntés meghozva (6.3); az implementálás a user szavára
> indul. Az **élesítés a HTTPS-en múlik** (l. lent), de a HTTPS ingyenes, nem a fizetős
> domainen.

## 1. Fenyegetésmodell — mit ad hozzá, mit NEM

**Amit a mai állapot már fed** (nem itt oldjuk meg): a *kikapcsolt* gépről ellopott
lemez (LUKS), a hálózati lehallgatás (a HTTPS után), az XSS (CSP + HttpOnly token), a
kliens lemezén fekvő piszkozat (piszkozat-titkosítás).

**Amit az E2EE tesz hozzá:** a **futó szerver** és a **szerver-oldali szivárgás** (DB-dump,
VPS-szolgáltató memória-hozzáférése) ellen véd. Ezután a szerver csak **titkosított blobot
+ nyílt metaadatot** lát.

**Amit az E2EE NEM fed, és ki kell mondani:**
- **Metaadat-szivárgás** — a szerver látja a szekciónkénti elemszámot, az
  `updatedAt`-időbélyegeket, a sorrend-pozíciókat és (F3-tól) a `seq`-et, vagyis az írások
  sorrendjét (l. 4. szakasz). ⚠ Ma az `_id` is hordozza a létrehozás idejét — javítás: 6.3/D6;
  az `updatedAt` kivezetése: 6.3/D7. Ez durva mintázat, soha nem tartalom, de mintázat.
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
  nyílt oszlop. ⚠ De az ObjectId-alakú `_id` első 4 bájtja ma ugyanezt az időt hordozza —
  amíg a 6.3/D6 nincs kész, a `createdAt` elrejtése csak látszólagos.
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
- **AAD (additional authenticated data): `section` + `_id`.** Ez a helyéhez köti a
  ciphertextet: a szerver nem cserélheti ki két elem blobját (swap-támadás) anélkül, hogy a
  `decrypt` el ne hasalna. E2EE-nél a szerver ELLENSÉGES — ezt teszt bizonyítja.
  **A `user` KIMARADT az AAD-ból** (2026-09-22, a bekötés hozta felszínre): a kliens a saját
  Mongo user-id-jét nem ismeri (a szerver szándékosan sosem küldi ki, least-disclosure), és
  nincs is rá szükség — a user-hez-kötést a **per-user mesterkulcs** adja (más felhasználó a
  saját MK-jával eleve nem fejti meg a blobot, a GCM-címke bukik). A same-user és a szekció-
  swapet az `_id` és a `section` fogja; a `user` így redundáns volt ÉS rekonstruálhatatlan.

## 5. Feloldás-életciklus és a RELOAD-probléma (fontos)

A HttpOnly-token menet (kész, `a4774fc`) óta a JS nem tart tartós titkot: a
munkamenetet a szerver-oldali süti tartja, a kliens a piszkozat-kulcsot ma RELOAD után a
szerverről újra-lekéri. **E2EE-nél a szerver az MK-t nem ismeri**, tehát reload / új lap
után az MK eltűnik a memóriából, és **nem pótolható a szerverről** → a felhasználónak
**újra be kell írnia a jelszót a feloldáshoz**.

Ez egy új állapotot hoz: a süti szerint „belépve", de a tartalom „zárolt" (nincs MK) →
kell egy **lock-képernyő**. Ez az E2EE inherens ára a jelenlegi modellben.

**Eldöntve és kész** (`feat(frontend): lock the app after reload and adopt the key across
tabs`): reloadkor **re-prompt** a lock-képernyőn, DE ha egy másik lap már fel van oldva, az új
lap a `BroadcastChannel`-en jelszó nélkül átveszi a kulcsot — a kulcs végig csak memóriában
utazik, és minden lap bezárása után újra jelszó kell. A `sessionStorage`-ba tett MK elvetve
(laponként külön él, és a tartós tárolás elvét is lazítaná).

## 6. Keresés, szűrés és szinkron a kliensen (F3 — az élesítés előfeltétele)

Az E2EE megöli a szerveroldali keresést és szűrést (`readSearch`, `readSearchMode`,
`readAuthors`, a genre/category-szűrés): a szerver titkosított blobot lát. Ezek a kliensre
költöznek. **Az élesítés előfeltétele** — a user kérte, hogy „a többi funkció is
működjön": az E2EE-t nem kapcsoljuk be, amíg ez nincs kész.

> **Állapot (2026-10-01):** TERV két mérési körrel (M0a, M0b — 6.2). **Eldöntve (✅):**
> ékezet-érzékeny részszöveg-keresés, mint eddig; delta = felhasználónkénti `seq` + sírkő
> + zár alatti szinkron-olvasás + elemszám-riasztó (részletek: 6.4); **D1** ritka sorszám;
> **D2** szókincs-index (Web Workerben építve); **D3** O3 + O6; **D4** ablakozás; **D5**
> JSON, tömörítés nélkül (a hálózati mérés után újranézve); **D6** véletlen `_id`; **D7**
> `updatedAt` → `seq`; **D8** `persist()` egyszer; + az automatikus zárolás az F4 elé. A
> telefonos alapkör (M0c) lefutott (6.2 F); a maradék mérések időzítése: 6.7.
> **Hatókör:** a quotes (ma az egyetlen titkosított szekció) + egy szekció-független
> szinkron-motor, amire a to-do/film E2EE-je később ráül; a 6.3/D1 sorrend-modell MINDEN
> szekciót érint.

### 6.1 Mit kell visszahozni

A `10bb9f0` (`feat(quotes): store quote content end-to-end encrypted`) törölte, a git-
történetből (`10bb9f0~1`) visszahozható, de a forrása a SZERVER helyett a helyi halmaz lesz:

- **navbar-kereső** (`Navbar/quoteSearch`, `quoteSearchState`) a mód-döntéssel: szerző-mód
  (`/quotes/:author`) csak ha `A ∧ ¬S` (A = pontosan egyező szerző, S = a kifejezés
  részletként szerepel egy idézet SZÖVEGÉBEN), különben szöveg-mód (`/quotes/search/:term`);
  `Anonymous` → a névtelenek; Escape ürít; a mező az URL-t tükrözi;
- **szerző-szűrt nézet** a piros akcentus-móddal, **találati nézet**, szerző-LINK a kártyán;
- **szerző-autocomplete** (ghost text, a legutóbb használt szerző — a `createdAt` a blobban
  van, tehát kliens-oldalon ez is megvan);
- húzás szűrt nézetben is.

A SZEMANTIKÁT a törölt backend-tesztek (`readSearch.test.js`, `readSearchMode.test.js`,
`readAuthors.test.js`) rögzítik: részszöveg, kis/nagybetű-független, ékezet-érzékeny, a
kifejezés szélei levágva, a szövegben VAGY a szerzőben. Ezek az esetek a kliens tesztjeibe
költöznek — a viselkedés a régi szerződésből jön vissza, nem emlékezetből.

### 6.2 Mérések (M0a + M0b)

**Felállás.** Determinisztikus próbaadat (a mérőszkriptek a repón kívül élnek), magyaros
szókinccsel, ami **Heaps-törvényt** követ: tő × toldalék, tehát a különböző szóalakok száma
a korpusszal nő, mint egy agglutináló nyelvnél (az M0a fix, 6000 szavas szókincse ezt
alulbecsülte, pedig a token-indexek mérete épp ezen múlik). Három alak: **könyvjelző**
(~130 karakter), **idézet** (p90 ≈ 900 karakter + szerző), **jegyzet** (~2 300 karakter,
bekezdésekkel); 10 000–100 000 elem. Helyszínek:
- **Pi 4, Node 22** — nincs AES-utasítás, tehát a WebCrypto itt pesszimista;
- **Chrome 151, asztali Ryzen 7**, fojtás nélkül (1×) és **4× CPU-fojtással** (≈ közép-
  kategóriás telefon; a WebCrypto és az IndexedDB nem fojtódik, tehát ott optimista);
- **FerretDB v2.7, eldobható adatbázis** (`f3bench_m0b`, a mérés végén törölve; az élő
  adatbázishoz és a `notes.service`-hez nem nyúlt);
- **valódi telefon:** M0c, a mérőlap kész (6.7).

**A) Adatmennyiség (MB)**

| | könyvjelző 50k | idézet 10k | idézet 50k | idézet 100k | jegyzet 10k | jegyzet 50k |
|---|---|---|---|---|---|---|
| nyílt szöveg | 6,6 | 4,7 | 23,4 | 46,7 | 23,1 | 114,5 |
| dróton: JSON + base64 (gzip-pel) | 16,2 (9,9) | 7,7 (5,4) | 38,7 (26,9) | 77,4 (53,9) | 32,4 (24,0) | 162 (120) |
| helyi tartalom-vödrök | 11,3 | 5,8 | 28,8 | 57,5 | 24,1 | 119,6 |
| szókincs-index: nyers / tömörített | 5,2 / 3,4 | 3,5 / 2,4 | 14,5 / 8,8 | 26,9 / 15,6 | 12,9 / 8,0 | 52,3 / 28,4 |
| manifest (azonosító, sorszám, `seq`, vödör) | 2,1 | 0,4 | 2,1 | 4,2 | 0,4 | 2,1 |
| különböző szóalak | 155 e | 117 e | 352 e | 549 e | 358 e | 950 e |

**B) Szerver — FerretDB a Pi-n, idézet-alak**

| | 10 000 elem | 50 000 elem |
|---|---|---|
| a MAI lista-végpont (`find().sort("order")`) | 2,1 s | **14,2 s** |
| **sorszám-eltolás: beszúrás az 1. helyre (= a MAI alapértelmezett létrehozás)** | **12,3 s** | **61,7 s** |
| **törlés a lista elejéről · mozgatás a végéről az elejére** | **13,4 · 13,4 s** | **57,6 · 58,9 s** |
| delta egy eltolás után: sorok · teljes / csak-sorszám | 10 000 · 8,4 / 0,6 MB | 50 000 · 42 / 2,9 MB |
| teljes szinkron, `(seq,_id) >` kulcs-lapozás (`$or`), 1000-es lapok | 3,1 s | 33,1 s |
| teljes szinkron, `seq >` + rendezés + limit (index-tippel is) | — | 29,3 s |
| **teljes szinkron, korlátos `seq`-ablak (1000), rendezés a Node-ban** | — | **10,4 s** |
| kis delta (1–10 sor) · elemszám (`countDocuments`) | 12 ms · 40 ms | 17–24 ms · 99 ms |
| egy írás a zár alatt: számláló `$inc` + az elem írása | 23 + 19 ms | 25 + 20 ms |

A rendezett alakoknál a FerretDB (DocumentDB) a `{user, seq}` indexet használja, de utána
**rendez** (az index sorrendje nem a BSON-rendezésé) — laponként a teljes maradékot, ezért
négyzetes. A korlátos ablak lineáris (~0,2 ms/elem).

**C) Kliens-lánc — Chrome 1× / 4×, idézet-alak**

| | 10 000 | 30 000 | 50 000 |
|---|---|---|---|
| első szinkron: tételes visszafejtés, WebCrypto | 0,23 / 0,82 s | 0,79 / 2,5 s | 1,35 / 3,6 s |
| ugyanez @noble-lel (a mai szinkron út) | 0,51 / 2,0 s | 1,5 / 5,9 s | — |
| szókincs-index építése (EGYSZER eszközönként) | 0,22 / 1,1 s | 0,65 / 3,4 s | 1,3 / 7,1 s |
| **hideg indítás: tételes borítékok (O1)** | 0,25 / 0,71 s | 0,71 / 2,4 s | 1,3 / 3,9 s |
| **hideg indítás: minden vödör visszafejtve** | 0,05 / 0,21 s | 0,17 / 0,66 s | 0,38 / 1,24 s |
| **hideg indítás: index + manifest + 1 vödör** | 0,03 / 0,11 s | 0,13 / 0,27 s | 0,17 / 0,45 s |
| delta: 1 tartalom-változás (1 vödör + manifest írva) | 12 / 98 ms | 21 / 66 ms | 67 / 87 ms |
| IndexedDB-használat (a három alak együtt) | 24 MB | 58 MB | 93 MB |

Jegyzet-alakkal (4×): 10k → „minden vödör" 1,1 s, index 0,37 s; **30k → 3,1 s és 1,4 GB
heap**, index 0,91 s. Könyvjelző 50k (4×): 0,76 s vs 0,22 s.

**D) Keresés — a legrosszabb kifejezés ideje; pontosság**

| | idézet 50k, Pi | idézet 50k, Chrome 4× | jegyzet 30k, Chrome 4× | jegyzet 50k, Pi |
|---|---|---|---|---|
| pásztázás (minden nyílt szöveg a memóriában) | 71 ms | 64 ms | 132 ms | 196 ms |
| szókincs-index, ≥ 3 karakter / „a" | 24 / 78 ms | 19 / 65 ms | 38 / 136 ms | 65 / 217 ms |
| egyezik a pásztázással? | **minden** halmazon, minden kifejezésre (szóközép, több szó, ékezet) | igen | igen | igen |

- **MiniSearch** (token, előtag): idézet 30k-n 12,8 s építés, 200 MB heap, 5,0 s
  visszatöltés, az „a" 1,25 s — és a szóközépi „ság" **0 találat a valódi 15 266 helyett**.
- **Trigram-index:** a nyílt szöveg 2,6-szorosa, MINDIG nyílt szöveges utóellenőrzés kell
  (a trigram-egyezés nem részszöveg-egyezés); idézet 30k-n 11 s / 92 MB heap.
- **FlexSearch, Fuse.js:** az M0a szerint drágább és/vagy szóközépre vak.
- **A szókincs-index delta-rétege:** 1 / 100 / 1000 változás 0,6 / 11 / 130 ms (idézet
  50k, Pi), a lekérdezés +2–5 ms-ot lassul tőle.

**E) Renderelés — a VALÓDI kártyarács (dnd-kit + QuoteCard, visszafejtés a renderben)**

| kártya | első festés 1× / 4× | húzás indulása 1× / 4× | JS-heap | DOM-elem |
|---|---|---|---|---|
| 1 000 | 0,49 / 2,0 s | 0,38 / 1,4 s | 20 MB | 6 200 |
| 2 000 | 0,98 / 3,7 s | 0,90 / 3,1 s | 42 MB | 12 500 |
| 5 000 | 2,4 / 10 s | 2,7 / 12 s | 119 MB | 31 000 |
| 10 000 | 5,3 / 38 s | 8,0 / 34 s | 359 MB | 62 000 |
| 20 000 | 13 / 83 s | 26 / 108 s | 1 046 MB | 123 000 |
| **ablakozva (60 kártya a DOM-ban)** | **0,04 / 0,12 s** | **0,02 / 0,18 s** | — | 300 |

Visszafejtés nélkül (előre visszafejtett szöveggel) a festés ~20–40%-kal rövidebb: a nagy
ár maga a DOM és a dnd-kit, nem a kriptó.

**Célkészülék (a user elve, 2026-10-01):** a MEGJELENÍTÉST elsősorban a user telefonjára
tervezzük (Android, Chrome; 424×942 CSS-pixeles nézet), de MÁS eszközön is jól kell működnie — a
teljesítmény-kereteket ezért a gyengébb eszközökön is ellenőrizzük — valódi gyengébb
telefon NEM kell, elég az utánzás (Chrome CPU-fojtás; a 4× ≈ középkategória). A célkészülék
mérése tehát felső korlát, nem cél. (Az elv a CLAUDE.md „Célkészülék" szakaszában is áll.)

**F) Valódi telefon (M0c, alapkör) — a célkészülék (felső kategóriás Android), Chrome 153**

| | idézet 10k | idézet 30k |
|---|---|---|
| első szinkron: tételes visszafejtés (WebCrypto / @noble) | 0,58 / 0,63 s | 1,55 s / — |
| szókincs-index építése | 0,36 s | 1,09 s |
| hideg indítás: tételes / minden vödör / index | 0,28 / 0,06 / 0,03 s | 1,54 / 0,20 / 0,08 s |
| keresés, legrosszabb: pásztázás / index | 4,4 / 5,7 ms | 13 / 13 ms |
| IndexedDB-írás: vödrök / tételes | 0,05 / 1,2 s | 0,20 / 3,6 s |

Renderelés: 1 000 kártya 0,48 s festés / 0,43 s húzás-indulás; 2 000: 1,2 / 0,70 s;
**5 000: 3,4 / 2,8 s; ablakozva 0,07 / 0,04 s.** Ez a telefon felső kategóriás: a 4×-es
fojtásnál jóval gyorsabb, a lánc lépései az asztali 1× 0,6–2,5-szörösei. A következtetéseken
nem változtat; a D2-nél viszont kimondandó, hogy EZEN a telefonon, idézet-alakkal 30 000-ig a
pásztázós indítás is gyors (0,2 s) — az index előnye a jegyzet-alaknál, 50 000 fölött, gyengébb
eszközön és a memóriában jelentkezik. (A `persist()`/kvóta a claude.ai-keretben nem mérvadó.)

**Amit a mérés mond:**
1. **A mai sorszámozás nem bírja a skálát — az E2EE-től függetlenül.** Egy eltolás minden
   érintett dokumentumot újraír, a FerretDB ~1,2 ms-ot kér dokumentumonként: 10 000
   elemnél **minden alapértelmezett létrehozás 12 s**, 50 000-nél **egy perc** — a per-user
   zár alatt, tehát a felhasználó minden más írása is addig vár. A delta-szinkronban
   ugyanez N „változott" sort jelent minden más eszköznek. → D1.
2. **A „mindent kirajzol" lista már 1–2 ezer kártyánál lassú** (4×: 2 s festés, 1,4 s, mire
   egy húzás elindul), 10 000 fölött használhatatlan. → D4.
3. **A tételes borítékok helyi tárolása a hideg indítást 3–9×-esére lassítja** a vödrökhöz
   képest. → D3 (O2/O3).
4. **A szókincs-index EGZAKT** (11 halmazon, minden kifejezésre ugyanazt adja, mint a
   pásztázás), a hideg indítást a „mindent visszafejt" úthoz képest ~3×-osára gyorsítja,
   és nem kell hozzá a teljes nyílt szöveg a memóriában. → D2.
5. **A szerver-olvasás a FerretDB-n ~0,2 ms/elem, de csak korlátos ablakkal:** az első teljes
   szinkron 50 000 idézetnél ~10 s szerveridő (egyszeri, folytatható); a delták ms-osak.
   A mai lista-végpont 50 000-nél 14 s — ez is megszűnik.
6. A gzip −30% a dróton, de ~80–110 ms/MB CPU a Pi-n; a base64 +33%. → D5.

### 6.3 Döntési pontok

**✅ D1 — Sorrend-modell (ÚJ, a mérés hozta; MINDEN szekció) — ELDÖNTVE 2026-10-01.**
*A döntés: RITKA (hézagos) egész sorszám, amit a SZERVER számol* — a user feltételével:
**az áthelyezés minden mai útja megmarad** (húzás; a szerkesztő sorszám-léptetője; húzás
szűrt/találati nézetben a célkártya GLOBÁLIS helyére; a lista eleje/vége), és ezek
mindegyikére teszt kell. Az `order` biztonságos
egész marad (Number, ugyanaz az index), de 2^16 (65 536) távolságra indulnak az elemek.
Beszúrás két szomszéd közé = a felezőpont; a lista elejére/végére = ±2^16 a széltől; törlés =
nincs eltolás. Ha két szomszéd közt elfogy a hely (ugyanoda 16 beszúrás után), a szerver egy
kis ablakot újraoszt — ritka, és sorrend-megtartó írási sorrenddel, hogy egy félbeszakadás
se rontsa el a rendezettséget. A kliens nem számot küld, hanem a szomszédokat
(`{after: id | null, before: id | null}`); a szerver a per-user zár alatt két pont-olvasással
számol. A felületen látható pozíció (a szerkesztő sorszám-léptetője) SZÁRMAZTATOTT: a kliens
a rendezett listából számolja. Holtverseny (két eszköz ugyanoda) esetén a rendezés kulcsa
`(order, _id)`. Hatás: egy írás = 1 dokumentum (mérve 20 ms), a delta 1 sor, és az
`ordering.js` eltoló+visszavevő algebrája (`shiftFor*`, `undoShiftFor*`, `shiftThenWrite`)
a közös útból KIESIK — a nem-atomi többdokumentumos írás csak az újraosztásban marad. A
meglévő adat átállása egyszeri: `order × 2^16`. A `check-ordering` invariánsa „1..N hézag
nélkül"-ről „szigorúan rendezett `(order, _id)`"-re vált.
- *Alternatíva:* **tört-rang szövegként** (fractional indexing): soha nincs újraosztás, de a
  kulcs hossza nő, és a FerretDB szöveg-rendezését (bájtsorrend?) előbb mérni kell.
- *Kompromisszum, az árával:* sűrű sorszám marad, a delta csak-sorszám sorokat küld (50k-n
  2,9 MB 42 helyett) — **a szerver percnyi eltolását nem oldja meg**, tehát a skála-
  követelménnyel összeegyeztethetetlen.

**✅ D2 — Keresés — ELDÖNTVE 2026-10-01.**
*A döntés: SZÓKINCS-INDEX, titkosítva perzisztálva, eszközönként EGYSZER építve.* (Fogalom:
*inverz index* — szóból mutat a dokumentumokra, mint egy könyv tárgymutatója. A „szókincs-
pásztázó" változatnál a szóalakok egyetlen szövegben állnak, és a RÉSZSZÓT a szókincsben
keressük, nem a dokumentumokban.) Az elválasztó nélküli kifejezés pontosan akkor szerepel egy
dokumentumban, ha valamelyik szavában benne van — erre az index EGZAKT, ellenőrzés nélkül; a
szóközt/írásjelet tartalmazó kifejezésnél a futamok metszete JELÖLT-halmaz, amit a
visszafejtett szövegen ellenőrzünk. A szerző nem kerül az indexbe: a manifest hordozza (a
szerző-szűrés, a javaslat, a mód-döntés `A`-ja és a szöveg-mód szerző-részszó ága innen jön,
az `S` csak a szöveg-indexből — a mai szemantika így pontos). Építés az első teljes szinkron
után, **Web Workerben** (eldöntve 2026-10-01, a „máson is jól működjön" elv miatt: 4×-es
fojtással az építés 50 000 idézetnél 7 s, 30 000 jegyzetnél 18 s — a főszálon darabolva is
akadna a felület). A Worker látja a WebCryptót, a DOM-ot nem; a `new Worker` a Trusted Types
miatt egy policyt kap, ami CSAK a saját, bundle-ölt worker-fájlunkat engedi. Az építő függvény
tiszta függvény marad (a Workertől függetlenül tesztelhető). Változáskor DELTA-RÉTEG (a fenti
mérés), időnként TÖMÖRÍTÉS — ugyancsak a Workerben.
Amíg az index nincs kész (első szinkron), a kereső „betöltés" állapotban áll: részleges
halmazon NEM keresünk (hamis „nincs találat" volna).
- *Egyszerűbb kompromisszum, az árával:* **pásztázás index nélkül** — egzakt, 0,2 kB, de
  MINDEN munkamenet a teljes tartalom visszafejtésével indul (4×: 1,24 s idézet 50k-n;
  jegyzet 30k-n 3,1 s és 1,4 GB heap), és az egész nyílt szöveg a memóriában ül. A skálával
  lineárisan romlik; jegyzet-alaknál telefonon elfogadhatatlan.
- *Elvetve, mérve:* token-index (MiniSearch/FlexSearch — szóközépre vak, drága), trigram
  (2,6× méret, mindig utóellenőrzés).

**✅ D3 — Helyi tár — ELDÖNTVE 2026-10-01: O3 + O6.** A teljes opció-lista a
fenyegetésmodellel: **6.5**. *A döntés: O3 + O6* — titkosított vödrök + manifest + index, HKDF-fel az MK-ból származtatott
helyi kulcsokkal, és egy szerver-oldali eszköz-titokkal a HKDF sójában, ami kijelentkezéskor
törlődik (a lemezen maradó maradvány attól fogva kriptográfiailag halott).

**✅ D4 — Lista-renderelés: ABLAKOZÁS (virtualizálás) — ELDÖNTVE 2026-10-01.**
*A döntés:* sor-alapú ablakozás dinamikus magasság-méréssel (a rács 1–4 oszlopos, a kártyák
eltérő magasak), egy fej nélküli könyvtárral (pl. `@tanstack/react-virtual` — a bundle-hatás
az implementációnál mérendő, a valibot-minta szerint). A húzott kártya akkor is a DOM-ban
marad, ha kigördül (`rangeExtractor`), és `DragOverlay`-ben úszik; a távoli áthelyezés útja
a szerkesztő sorszám-léptetője. A kártya továbbra is a renderben fejt vissza: a mért
különbségből ~0,16 ms/kártya (4×: ~0,7 ms), 60 kártyánál ~10 ms (4×: ~40 ms); a látható
vödröket előre visszafejtjük. ⚠ jsdom-ban nincs elrendezés: a rács-tesztek mért méretet adnak,
és fej nélküli Chrome-os ellenőrzés kell.
- *Kompromisszum, az árával:* „továbbiak" (az első néhány száz kártya, görgetésre hozzáfűzve)
  — egyszerűbb, de mélyre görgetve visszahozza a fenti költséget, és a dnd-kit minden
  kirajzolt kártyát végigmér.

**✅ D5 — Átviteli formátum — ELDÖNTVE 2026-10-01.**
*A döntés: most JSON + base64, tömörítés nélkül;* a VPN-es hálózati mérés (6.7) után
újranézzük. Ha ott a hálózat dominál, az első lépés a BINÁRIS keretezés (a nyers bájtok
base64 nélkül: −25%, CPU nélkül), nem a gzip (−30%, de ~80–110 ms/MB a Pi-n, és a FerretDB-
olvasás amúgy is ~0,2 ms/elem).

**✅ D6 — Az `_id` ma a létrehozás idejét hordozza (ÚJ lelet) — ELDÖNTVE 2026-10-01:
véletlen azonosító MINDEN szekcióban** (egy generátor, nincs szekciónkénti kivétel).
A kliens ObjectId-alakú azonosítót gyárt (`objectId.ts`), aminek az első 4 bájtja a
másodperc-időbélyeg — vagyis a szerver (és a DB-dump, a napi mentés) MINDEN elem létrehozási
idejét látja, hiába került a `createdAt` a blobba (4. szakasz). *Ajánlás:* E2EE-szekciókban
12 véletlen bájt (az alak ObjectId marad, a validátorok átengedik; a kulcs-lapozás `_id`-t
csak holtverseny-feloldónak használ). Ára: egy függvény + teszt; a meglévő elemek az F4-
migrációban úgyis újra születnek.

**✅ D7 — Az `updatedAt` kivezetése (a `seq` után nem kell) — ELDÖNTVE 2026-10-01.**
A delta a `seq`-en áll, az `updatedAt` utolsó dolga a napi mentés „volt-e módosítás"
döntése (`daily-export.js`). *Ajánlás:* a döntés a `seq`-re vált (a legutóbb mentett `seq`
óta volt-e írás — a Pi óra nélküli, ez óra-független is), és az E2EE-szekciókból az
`updatedAt` kikerül: a DB-dumpból/mentésből eltűnik az elemenkénti szerkesztési idő (a futó
szerver az írások idejét persze látja). A felhasználónkénti számláló és a mentés-döntés
váltása ezért már az **F3-0-ban** jön, a ritka sorszámmal EGYÜTT (a dokumentumonkénti `seq`
és a sírkő az F3a-ban). ⚠ A váltás KÖTELEZŐ, ha a D1 megvalósul: a mai
`updatedAt`-alapú döntés nem lát olyan törlést, ami senkit nem tol el (kódból levezetve: ma a
lista utolsó elemének törlése; ritka sorszámozással MINDEN törlés) — a mentés ilyenkor kimarad,
és a következő mentésig a törölt elemet őrzi.

**✅ D8 — Kiürítés és `persist()` — ELDÖNTVE 2026-10-01.** A helyi tár gyorsítótár, nem
forrás (6.5). *A döntés:* a `navigator.storage.persist()` EGYSZER, az első teljes szinkron után (a Chrome nem kérdez,
a heurisztikája dönt; a Firefox egyszer rákérdez); elutasításnál nem kérdezünk újra, és a
működés nem függ tőle (kiürítés = folytatható újraszinkron). A claude.ai-keretben ez nem
mérhető (partícionált tár) — hogy a Chrome megadja-e, az élő HTTPS-originen derül ki.

**✅ Kapcsolódó, F3-on KÍVÜL — az F4 (élesítés) ELŐFELTÉTELE (eldöntve 2026-10-01):
automatikus zárolás, a KIJELENTKEZÉSI IDŐHÖZ kötve** (a user javaslata): nincs külön szám,
EGY óra marad — a 15 perces tétlenségi kijelentkezés (`IDLE_LOGOUT_MS`, ami a token
élettartamával egyezik). A tétlenségi ág ma is eldobja az MK-t (a kijelentkezés a függő
mentések lefutása után `clearMasterKey`-t hív). A rés a REJTETT lap: a háttérbe tett lapon a
böngésző az időzítőket ritkítja, telefonon a lapot le is fagyaszthatja (dokumentált
viselkedés) — a 15 perces ellenőrzés így nem fut le időben, az MK addig a memóriában ül.
Ezért: (1) a lap visszatérésekor (`visibilitychange`/`resume`) a tartalom ELŐTT fut le
ugyanaz a 15 perces szabály; (2) ⬜ a lefagyasztás pillanatában (Chrome `freeze` esemény) az
MK eldobása — hogy ez telefonon elfogadható-e (milyen hamar fagyaszt az Android egy háttérbe
tett lapot), az F4 előtt mérendő. A lopott, feloldott állapotú telefon memóriájában így nem
marad kulcs (a 6.5 fenyegetésmodelljének egyetlen nyitott rése a helyi tárnál).

### 6.4 ✅ A delta-szinkron protokollja (eldöntve; a mérés diktálta részletek is jóváhagyva 2026-10-01)

- **`seq`:** felhasználónkénti számláló (a `users`-en), minden írás (create/update/delete,
  átsorolás, újraosztás) a per-user zár (`serializePerUser`) ALATT `$inc`-kel kap értéket,
  amit az érintett dokumentum(ok)ra ír (`writeItem` mellé, ugyanabba az invariáns-modulba).
  Többdokumentumos írásnál (D1 újraosztás) minden dokumentum SAJÁT értéket kap (`$inc: K`) —
  így a kurzor egyetlen szám, és a lapozás egyszerű marad. (Ez a D1 ritka sorszámozásával
  olcsó; sűrű sorszámmal egy eltolás N dokumentumot írna, egyenként.)
- **Sírkő:** törléskor `{user, section, itemId, seq}`, tartalom nélkül (`exportName = null`,
  indokkal). A kliens a sírkövet csak akkor alkalmazza, ha újabb, mint a nála lévő elem
  `seq`-je; a késve érkező, már törölt azonosítójú create-ismétlést a szerver a sírkőből
  ismeri fel, és nem hozza létre újra (a létrehozás megtörtént, a törlés is — különben a
  törölt elem „feltámadna").
- **Olvasás a zár alatt**, KORLÁTOS `seq`-ablakokban (a mérés szerint a FerretDB a rendezett
  `seq >` alakot négyzetesen szolgálja ki); a szerver az ablakokat addig lapozza, amíg ~1000
  elem vagy ~1 MB össze nem jön, és memóriában rendez. Az ablak mérete alkalmazkodik (üres
  ablaknál nő, túl telinél felez), mert a számláló az évek alatt jóval túlnő az elemszámon.
  Válasz: `{items, deleted, next, cursor, count}`; a záró lap hozza a sírköveket, a végső
  kurzort és az elemszámot.
- **Folytatható első szinkron:** a kliens minden átvett lap után a titkosított manifestbe írja
  a kurzort — egy félbeszakadt szinkron onnan folytatódik.
- **Elemszám-riasztó:** ha a helyi tükör a delta után más elemszámot mutat, az protokoll-hiba
  → a helyi tár törlése, teljes újraszinkron + szerződés-hiba a naplóba (nem néma eltérés).
- **Több lap:** egyszerre egy lap szinkronizál szekciónként (Web Locks API), a többi a
  `BroadcastChannel`-ből értesül.
- A régi `POST /quotes` lista-végpont ezzel fölöslegessé válik → UGYANABBAN a lépésben
  törlendő. A `readForEdit` marad (a szerkesztő friss, hiteles betöltése).

### 6.5 Helyi tár — opciók a fenyegetésmodellen végigvezetve

Fenyegetések: **(T1)** ellopott eszköz (lemezkép; telefonon a „feloldás utáni" állapot is);
**(T2)** forenzikus maradvány — a böngésző tárolója LevelDB (Chrome) / SQLite (Firefox,
Safari); **MÉRVE (Chrome 151):** egy IndexedDB-érték FELÜLÍRT és TÖRÖLT változata is szó
szerint ott maradt a LevelDB-naplóban a böngésző bezárása után; a tömörítés után a
felszabadított blokkokban él tovább, SSD-n a kopás-kiegyenlítés miatt a felülírás sem törlés;
**(T3)** XSS a mi originünkön; **(T4)** rosszindulatú böngésző-kiterjesztés; **(T5)** másik
OS-fiók ugyanazon a gépen (rendszergazda is).

| opció | T1: mi látszik a lemezen | T2: maradvány | T3/T4 | T5 | hideg indítás (4×, idézet 50k) |
|---|---|---|---|---|---|
| **O0** csak memória | semmi | semmi (a swap kivétel) | mint mindenhol: feloldott állapotban az MK a memóriában | semmi | minden munkamenet teljes letöltés: 39 MB + ~10 s szerveridő |
| **O1** a szerver borítékai tételesen | darabszám, méretek, `_id`-k (bennük a létrehozás ideje, D6), sorrend, `seq` | régi borítékok, az MK-val ÖRÖKKÉ nyithatók | mint O0 | = T1 | 3,9 s |
| **O2** vödrök + manifest, HKDF(MK) | vödör-szám, összméret, írás ideje | régi vödrök, az MK-val örökké nyithatók | mint O0 | = T1 | 1,24 s |
| **O3** = O2 + titkosított index | = O2 | = O2 | mint O0 | = T1 | 0,45 s |
| **O4** eszközhöz kötött, nem kinyerhető `CryptoKey` az IndexedDB-ben (jelszó nélküli nyitás) | **minden** — MÉRVE: a JS-ből nem exportálható kulcs nyers bájtjai ott vannak a LevelDB-naplóban (a „nem kinyerhető" csak a JS-API-nak szól) | minden | XSS a ZÁROLT tárat is olvassa | rendszergazda mindent | jelszó nélkül nyit |
| **O5** passkey / WebAuthn PRF (későbbi feloldás) | = O3 | = O3 | = O3 | = O3 | = O3 (biometria a jelszó helyett) |
| **O6** = O3 + szerver-oldali eszköz-titok a HKDF sójában | = O3 | **kijelentkezés után kriptográfiailag halott** | = O3 | = O3 | = O3 (a titkot a `/me` hozza) |
| **O7** tároló-csere (OPFS, Cache API, localStorage) | biztonságilag azonos a választott titkosítással | azonos | azonos | azonos | — |

Ami MINDEN opcióra igaz: **a lemezen semmi nem teszi lehetővé az offline jelszó-
próbálgatást** — a `wrappedMk` + só csak a szerveren él, a helyi kulcs pedig a 256 bites
MK-ból származik; ezt meg kell őrizni (helyi jelszó-ellenőrzőt SOHA). A T3/T4 ellen tároló-
választás nem véd: a védelem a CSP + Trusted Types (él), és **üzemeltetési szabály
(elfogadva 2026-10-01): a `notes` saját, bővítmények nélküli böngésző-profilban fusson.** A T1 telefonos „feloldás utáni"
változata ellen a memóriát az automatikus zárolás üríti (6.3 ⏭).

**Az ajánlott O3 + O6 részletei:**
- **Kulcs-származtatás:** HKDF-SHA-256 a natív WebCrypto-ból (auditált, nem saját):
  IKM = MK, só = az eszköz-titok (O6), info = `notes/local/v1/<cél>` — célonként külön kulcs
  (vödrök, manifest, index, adatbázis-név). Az adatbázis NEVE is származtatott (hexa): a
  lemezen nem látszik a fióknév, két fiók egy böngészőben nem keveredik. (Fogalom: a *HKDF* egy
  erős kulcsból több, egymástól független alkulcsot csinál; nem lassú, mert a bemenete nem
  jelszó.)
- **Titkosítás:** AES-256-GCM, blobonként friss 96 bites IV (a véletlen-IV ütközés a várható
  írásszámnál elhanyagolható); **AAD = `notes-local|v1|<szekció>|<blob>|<blob-verzió>`**, a
  verziókat a manifest rögzíti → egy régi vödör visszacsempészése vagy két vödör felcserélése
  GCM-hibát ad.
- **Az eszköz-titok (O6):** 32 véletlen bájt eszközönként a szerveren (atomi születés, mint a
  `draftKey`-nél), a kliens véletlen eszköz-azonosítója alapján. Kijelentkezéskor a kliens
  törli a helyi adatbázist, a szerver az eszköz-titkot → a lemezen maradt maradvány az MK
  ismeretében sem nyitható. „Kijelentkezés mindenhonnan" = az összes titok törlése. Új
  metaadat: a szerver tudja, hány eszköz-gyorsítótára van a felhasználónak (időbélyeg
  nélkül). A szervernek a titok önmagában nem ad semmit (MK nélkül értéktelen).
- ⚠ **A piszkozat NEM kapja meg az eszköz-titkot** (ELTÉRÉS-jelölt döntés lesz): a
  gyorsítótár a szerverről bármikor újraépül, a piszkozat viszont mentetlen munka, ami a
  kijelentkezést is túl kell élje (l. `draft-encryption-design`, 8. szakasz).
- **Kiürítés kezelése:** (1) hiányzó tár → teljes, folytatható újraszinkron; (2) integritás-
  hiba (GCM bukik, hiányzó vödör, elemszám-eltérés) → a helyi adatbázis törlése +
  újraszinkron + szerződés-hiba a naplóba; (3) írhatatlan tár (privát ablak, tele kvóta) →
  memória-mód KAPU NÉLKÜL — csak egy extra réteg esik ki (`no-unprotected-states`); (4)
  `persist()`: D8.
- *Gyengébb opciók, ha valamiért kell:* O2 (index nélkül, a pásztázós D2-kompromisszummal) —
  a hideg indítás és a memória az ára; O3 O6 nélkül — a maradvány a jelszó/MK későbbi
  kompromittálódásakor olvasható marad.

### 6.6 Fázisok (mindegyik teszttel + mutáció-próbával)

- **M0c — telefonos mérés:** az alapkör kész; a maradék mérések időzítése: 6.7.
- **F3-0 — sorrend-modell (D1), MINDEN szekcióra:** ritka sorszám, szomszéd-alapú API,
  újraosztás, átállító szkript (a rangsor alapján újraszámoz, tehát ismételten futtatva sem
  ront), a `check-ordering` új invariánsa; a régi eltoló-algebra UGYANABBAN a lépésben
  törlendő. Vele EGYÜTT a felhasználónkénti változás-számláló és a napi mentés átállása rá
  (a D7 első fele) — enélkül egyetlen köztes commitban sem ismerné fel a mentés a törlést.
  (Az E2EE-től függetlenül is kell: a skála-követelményt ma a létrehozás sem bírja.)
- **F3a — backend-szinkron:** dokumentumonkénti `seq` + sírkő + `/quotes/sync` (ablakos
  olvasás) + index, véletlen `_id` (D6), az `updatedAt` kivezetése (D7 második fele), a régi
  lista-végpont törlése.
- **F3b — kliens-szinkron + helyi tár:** szekció-független motor (Web Locks, folytatható,
  elemszám-riasztó), O3 + O6 (6.5), kiürítés-út, eszköz-titok végpont.
- **F3c — keresés:** szókincs-index Web Workerben (építés, delta-réteg, tömörítés), a mód-döntés
  (`A ∧ ¬S`), szerző-szűrés és -javaslat — a törölt backend-tesztek eseteivel.
- **F3d — felület:** ablakozott rács + húzás (D4), a 6.1 listája visszahozva; a betöltő
  effektek versenyhelyzet-őrrel ÉS teszttel (CLAUDE.md 3. pont).
- **F3e — lezárás:** a CLAUDE.md skálakövetelmény-pontjának MEGOLDÁSA átírva (szerveroldali
  lapozás/keresés → helyi index + ablakos szinkron), memóriák, ez a szakasz rövidítve.

### 6.7 Telefonos mérés (M0c)

**Kész:** az alapkör a user telefonján (6.2 F). **Hátra** (a user kérésére a projekt memóriája
jegyzi, és a legalkalmasabb pillanatban kerül elő): (1) 50 000 idézet + 10 000 jegyzet a
mérőlapon — legkésőbb az F3c (index) előtt, de bármikor futhat; (2) a hálózati szakasz
mobilneten, VPN-en át — legkésőbb az F3a (szinkron-végpont) előtt, ettől függ a D5
újranézése. Gyengébb eszközre utánzással mérünk, valódi gyengébb telefon nem kell.

Privát mérőlap a claude.ai-on (a link a projekt memóriájában; HTTPS kell hozzá, mert a
WebCrypto és a tárhely-API-k csak biztonságos kontextusban élnek — a Pi-n ez még nincs).
Ugyanazt méri, mint a C) és az E) tábla (kitalált adaton), és az eredményt a lap saját
tárolójába menti. A hálózati szakaszt (letöltés VPN-en) egy adatbázis nélküli mérő-szerver
adja a Pi-n; az útmutató a lapon. ⚠ A mérőlap a claude.ai keretében fut: a tárhely ott
harmadik-féltől származó (partícionált), tehát a `persist()`/kvóta-válasza nem mérvadó az
élő appra.

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
- **F3 — kliens-index + keresés/szűrés + chunk/delta szinkron** (az élesítés előfeltétele;
  terv és mérések a 6. szakaszban). Előtte **F3-0: a sorrend-modell** (6.3/D1) — az E2EE-től
  függetlenül is kell, mert a mai sorszámozás a skálán a létrehozást sem bírja.
- **HTTPS** — ingyenes aldomain + Let's Encrypt DNS-01 (bármikor, párhuzamosan).
- **F4 — élesítés:** F1 + F3 + HTTPS + az **automatikus zárolás** (6.3) megléte után;
  globális kiléptetés + a saját (kicsi) adat migrációja: tiszta újraregisztráció VAGY egyszeri
  kliens-oldali migráció.

## 10. Tesztstratégia

- **Kör-teszt:** titkosít → szerverre ment → visszaolvas → dekódol → ugyanaz.
- **Nonce-egyediség:** két egymás utáni titkosítás IV-je eltér (mutáció-próbával).
- **AAD-swap elutasítás:** más `_id`/`user` alá tett blob dekódolása HIBÁT dob.
- **Rossz jelszó:** a wrapped-MK kicsomagolása hibát dob, nem ad ki fél-adatot.
- **A szerver-vakság szerződés-tesztje:** a `/login`/`/refresh`/lista-válaszokban NINCS
  nyílt tartalmi mező (alakra illesztve, nem mezőnévre) — a mai `session.test.js` mintája.
- Minden új `if`/kapu MUTÁCIÓ-PRÓBÁVAL (a pontos tesztje bukjon a kivételére).

## 11. Nyitott / mérendő kérdések

- ⬜ Argon2id-paraméterek a KLIENSEN (memória/iteráció) — a szerveroldalitól eltér, mert a
  leggyengébb kliens-eszközön (régi telefon) is elviselhető kell legyen; MÉRENDŐ.
- ⬜ Bundle-hatás: `hash-wasm` mérete (a valibot/@noble mérés-mintája szerint).
- ⬜ Migráció F4-nél: újraregisztráció vs. kliens-oldali migráció.
- ⬜ Termék előtt újranézni: helyreállító kulcs hiánya (jelszóvesztés = teljes adatvesztés).
- ⬜ Az automatikus zárolás: az MK eldobása a lap lefagyasztásakor (Chrome `freeze`) — az
  F4 előtt, az Android háttér-viselkedésének mérése után (6.3).
- ⏳ F3: a maradék telefonos/hálózati mérések (6.7); a D5 a hálózati mérés után újranézendő.
