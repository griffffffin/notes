# CLAUDE.md

Ez a fájl útmutatást ad a Claude Code-nak ehhez a projekthez.

## Projekt célja

Egy 2022-es szakdolgozat-projekt (React + Express + MongoDB to-do app) **portolása**
Raspberry Pi 4B-re, MongoDB helyett FerretDB-vel, és bővítése több-szekciós
rendszerré (to-do-n túl: filmek, sorozatok, idézetek, jegyzetek, könyvek, egyéb
könyvjelzők). Portfólió-darab újbóli webfejlesztői álláskereséshez — a kód, a git
history és a dokumentáció bemutatható minőségű kell legyen.

**Fontos**: nem újraírás, hanem port — a régi design (CSS/Bootstrap) és a
komponensek nagy része átkerül, csak az új backend és szekciók köré bővül.

**Az app neve `Notes`** (2026-08-01 óta): a to-do mára egy szekció a több közül,
a régi név szűk lett. Ez a névváltás lépésenként ment — a kód, a systemd-unitok,
a mentés-gyökér (`/opt/backups/notes`) és a telepítési útvonal (`/opt/notes`) már
`notes` nevűek. Egyedül **az adatbázis neve maradt SZÁNDÉKOSAN a régi** (`to-do`),
mert annak mozdítása az élő adatot érinti: külön menetben, dumppal jön. Ahol
lentebb `to-do` szerepel, az vagy a to-do SZEKCIÓ, vagy az adatbázis neve — nem
elmaradt átvezetés.

## Régi projekt (referencia, portoláshoz)

- Backend: https://github.com/griffffffin/to-do-backend
- Frontend: https://github.com/griffffffin/to-do-frontend
- Ismert gyengeség a régiben, amit itt javítani kell: user-azonosítás kliens-oldali
  cookie-ból megy, nincs szerveroldali session-ellenőrzés (JWT/signed session kell
  helyette).

## Hardver / környezet

- Raspberry Pi 4B, 4 mag, 7.6GB RAM, Ubuntu (kernel 6.8), `/opt/notes` alatt fut a projekt
- Node.js v22.22.1
- FerretDB **v2.7.0** systemd service-ként fut (`ferretdb.service`,
  `/usr/bin/ferretdb`), a `127.0.0.1:27017` címen figyel. Háttértár:
  PostgreSQL 16 a DocumentDB extensionnel (`postgres` adatbázis). A MongoDB-
  kliensek (backend) hitelesítéssel kapcsolódnak, a Postgres-user adataival.
- A FerretDB Postgres-jelszava a `/etc/ferretdb.env`-ben él (root:root, 600),
  a unit `EnvironmentFile=`-lal tölti be — parancssorban/`ps`-ben nem látszik.
  (Erős, generált jelszó; 2026-07-12-én cserélve.)
- A Postgres hitelesítése `scram-sha-256` (nincs `trust` kiskapu) — a DocumentDB
  belső kapcsolatai a `postgres` user `~/.pgpass` fájljából veszik a jelszót.
  A jelszó három helyen él, együtt kell cserélni: Postgres-user +
  `/etc/ferretdb.env` + `backend/.env` (DATABASE).
- Titokkezelési elv: projektenként külön env-fájl (least privilege) — a to-do
  backend titkai a `backend/.env`-be (600, gitignore-olva), NEM más projektek
  közös titokfájljába.

## Lemeztitkosítás (KÉSZ; TELJES rootfs 2026-08-29 óta)

- **A teljes rootfs LUKS2-titkosított** (2026-08-29 óta) — nem csak a `/opt`, hanem
  az egész rendszer-SSD. A `/opt` (az app, az adatbázis adatkönyvtára és a mentések)
  a titkosított rootfs sima könyvtára; nincs külön kötet vagy fájl-konténer. A
  korábbi `/opt`-only megoldás (`opt.img` + `unlock-opt` szkript) **nyugdíjazva**.
- Fenyegetésmodell: ellopott, **kikapcsolt** gép; a lemezről az adat nem olvasható
  ki. A teljes titkosítás azért kellett a `/opt`-only helyett, mert a rootfs-en
  cleartextben álltak titkok (DB-jelszó, SSH host-kulcsok, WireGuard) — most azok is
  védve vannak. (A JWT_SECRET épp emiatt igényelt rotációt.)
- **A jelmondat SEHOL nincs a gépen**, ezért a gép bootkor NEM ér el a rendszerig:
  megáll a feloldásra várva, és fejetlenül, boot után kézzel kell feloldani. A
  konkrét feloldó-út (mely szolgáltatás, mely parancs) **szándékosan nem a repóban**
  él, hanem külön, nem verziózott üzemeltetési dokumentációban: gépspecifikus
  üzemeltetés, ami pontosan leírná ennek a gépnek a belső elrendezését. Ugyanez az
  elv, amiért a mentés-lehúzó szkriptek is a repón kívül vannak.
- **Fejlesztéskor figyelj**: feloldás nélkül a Pi el sem jut a rendszerig, tehát az
  `ubuntu` userrel SSH-zni sem lehet, és az sshfs-mount sem kapcsolódik — nem egy
  „üres `/opt`" félig-bootolt állapot, hanem a gép egyszerűen nem elérhető, amíg
  valaki fel nem oldja. (A régi fájl-konténeres modellben látszott üres `/opt`; az
  már a múlté.)

## Munkakörnyezet / elérés

- A helyi (fejlesztői) gépen **nincs Node/npm** — minden parancsot (npm, git,
  systemd stb.) SSH-n keresztül, a Pi-n kell futtatni (kulcsos belépés beállítva).
  A Pi konkrét címe, a belépő user és a helyi mount-útvonal a **nem verziózott**
  `CLAUDE.local.md`-ben van — a repo publikus, ezért gépspecifikus adat ide nem
  kerülhet.
- A projekt a helyi gépről sshfs mounton át látszik (útvonalak a
  `CLAUDE.local.md`-ben). Fájlszerkesztés mehet a mounton keresztül, de
  npm install / build / dev szerver mindig a Pi-n fusson (az sshfs-en át nagyon
  lassú lenne).

## Architektúra

- Monorepo: `frontend/` + `backend/` egy git repóban
- Frontend: React + Vite (NEM react-scripts/CRA, az elavult)
- Linter: **oxlint** (a create-vite 9 sablon alapértelmezése, `.oxlintrc.json`) —
  nincs ESLint-konfig, ne is keress.
- Nyelv: JavaScript egyelőre (TypeScript-re váltás később, külön lépésben, ha az
  alap már stabil)
- Backend: Express + Mongoose, FerretDB-hez kapcsolódva (MongoDB-kompatibilis protokoll)
- **Szótár — két szint, két név** (a kódban szándékosan külön, hogy ne
  keveredjenek): a felső szint a **szekció** (`section`) — egy tartalomtípus,
  saját collectionnel (to-do, idézetek, film…). A szekción belüli, elemekre
  vonatkozó osztályozás a **kategória** (`category`) vagy más domain-specifikus
  mező (film: `genre`, idézet: `author`). A régi kód a felső szintet is
  "kategóriának" hívta — ez ütközött a to-do saját `category` mezőjével, ezért a
  felső szint kódbeli neve `section` (l. `Navbar/sectionSwitcher.tsx`,
  `currentSection`). A to-do belső `category` DB-mezője VÁLTOZATLAN marad.
- Adatmodell: **szekciónként külön tábla/collection**, nem egy közös polimorf
  tábla. A szekción belüli szűrő-oszlopok (pl. film műfaja, to-do kategóriája)
  NEM külön táblák, hanem oszlop az adott szekció tábláján belül, amire az
  URL-routing szűr (pl. `/movies/comedy` a `movies` tábla `genre` oszlopára
  szűrt nézet).
- URL-struktúra: egy domain, szekciónkénti route-ok (`/movies/comedy`, `/series`,
  `/books`, `/thoughts`, stb.)
- Ismert szekciók eddig: movies (cím, évszám, genre), quotes (szerző, idézet
  szövege) - a többi (jegyzetek, sorozatok, könyvek, egyéb könyvjelzők) mezői
  menet közben tisztázandók.
- A legtöbb szekció-oldalra NEM kell kategória-/színválasztó és percentage
  (ezek a to-do sajátjai) — még nem implementálandó, csak tervezési tény.
- Skálakövetelmény: egyes szekciókban (pl. könyvjelzők) akár ~10 000 elem —
  a szekció-nézetekhez szerveroldali lapozás/keresés és indexek kellenek,
  a "mindent letölt és egyben renderel" minta ott nem játszik.

## Migrációs buktatók

- A régi kód `process.env.REACT_APP_*`-ot használ (CRA-konvenció) - Vite-nál ez
  `import.meta.env.VITE_*`, NEM 1:1 másolható át.
- Vite csak `.jsx` kiterjesztésű fájlban fordít JSX-et — a régi `.js`
  komponensfájlokat portoláskor át kell nevezni `.jsx`-re.

## Biztonsági mentés (KÉSZ, 2026-07-11)

- Napi **JSON**-export éjfélkor (`notes-export.timer` → `backend/scripts/daily-export.js`);
  az ELŐZŐ napot vizsgálja, csak ha volt módosítás; retenció: szekciónként a 30
  legfrissebb FÁJL (`RETENTION_COUNT`) — nem 30 nap, mert módosítás nélküli napon
  nem születik fájl, így 30 mentés ennél hosszabb időszakot is átfoghat;
  cél: `/opt/backups/notes/daily/`
- **A mentendő szekciók a MODELLEKBŐL derülnek ki**, nincs kézi lista: minden
  modell nyilatkozik magáról (`Model.exportName = "to-dos"`, illetve `null` a
  `users`-nél, mert jelszó-hash). A nyilatkozat nélküli modell HIBA
  (`backend/scripts/exportSections.js`): a szkript a nyilatkozó szekciókat
  lementi, majd nem-nulla kóddal lép ki — hangos, de nem viszi magával a működő
  mentéseket. A kaput CI-teszt őrzi, így új szekció nem maradhat ki némán.
- Heti teljes mentés vasárnap 01:00 (`notes-backup.timer` → `deploy/weekly-backup.sh`,
  pg_dump gzippel); ~100 heti retenció (`RETENTION_DAYS=700`); cél: `/opt/backups/notes/weekly/`
- Mindkét timer `Persistent=true`: kimaradt futást bepótol. A retenció csak akkor
  töröl régit, ha a legfrissebb mentés bizonyítottan ép/nem üres.
- A két mentést KÉT KÜLÖNBÖZŐ user írja (a napit az app user-e, a hetit a
  `postgres`), ezért a könyvtárak jogát egyszer be kell állítani:
  `sudo deploy/setup-backup-permissions.sh`. Ez adja a `weekly/` mappára a setgid
  bitet, ami nélkül a heti dump csak a `postgres` usernek olvasható — így nem
  lehetne külső gépre lementeni. Idempotens; újra kell futtatni, ha a
  mentés-könyvtárak valaha újra létrejönnek.

## Terítés (deployment)

- ÉLES: az app systemd service-ként fut (`notes.service`, a `deploy/` mappából
  telepítve) — az Express a 3001-es porton az API-t ÉS a buildelt frontendet is
  kiszolgálja (SPA-fallbackkel); bootkor indul, hibánál újraindul.
- Éles buildnél a frontend relatív URL-lel hívja az API-t (`.env.production`),
  CORS-ra csak a dev-felállásnak van szüksége (Vite dev szerver külön porton).
- FEJLESZTÉS: Vite dev szerver (5173) + `npm run dev` a backendben; a dev
  szerverek NEM futnak állandóan, kézzel indítandók.
- Online (interneten át) elérhetőség részletei egy későbbi, külön téma.

## Célkészülék (megjelenítés és teljesítmény)

- **A MEGJELENÍTÉST elsősorban a user telefonjára tervezzük** (Android, Chrome; ~424×942
  CSS-pixeles nézet — a pontos típus a `CLAUDE.local.md`-ben), **de MÁS eszközön is jól
  kell működnie.** (A user elve, 2026-10-01.)
- A user telefonja felső kategóriás: a rajta mért szám FELSŐ KORLÁT, nem cél. A
  teljesítmény-kereteket (indítás, renderelés, index-építés, feloldás) gyengébb eszközre is
  ellenőrizni kell — ehhez **valódi gyengébb telefon nem kell, elég az utánzás**: Chrome
  CPU-fojtás (4× ≈ középkategória; a mérési minta: `E2EE.md` 6.2).
- Egy mérés bemutatásakor ki kell mondani, melyik eszközön (vagy milyen fojtással) készült,
  és mi következik belőle a gyengébb eszközökre.

## Stílus / munkamódszer

- A kommunikáció magyarul megy.
- Minden lépéshez magyarázat kell (mit miért csinálunk) - a felhasználó tanulni
  akar programozás közben, újra el akar helyezkedni webfejlesztőként
- A magyarázatok legyenek inkább terjengősek, mint tömörek: új eszköz vagy fogalom
  első említésekor az alapfogalmakat is ki kell fejteni pár mondatban (pl. mi az a
  linter, mi az a Rust), nem elég egy odavetett fél mondat.
- A szakdolgozatban bemutatott szint (React hooks, Express, Mongoose alapok)
  ismert, de alapok felfrissítése új koncepcióknál (FerretDB, Vite, JWT auth)
  rendben van, sőt elvárt
- Tiszta, portfólió-minőségű git history az elejétől - ne legyen egy nagy
  "initial commit", hanem lépésenkénti, értelmes commit-üzenetek
- Commit-üzenetek angolul, Conventional Commits stílusban (`feat:`, `fix:`,
  `chore:`, `docs:` …). **NE** kerüljön beléjük `Co-Authored-By` vagy más
  AI-társszerző trailer — az AI-közreműködést ez a fájl dokumentálja.
- **A kódban minden azonosító (változó, függvény, konstans, teszt-segéd) ANGOL**
  — a tesztfájlokban is. A kommentek és a teszt-leírások (`test("…")`) maradnak
  magyarul: azok magyarázatok, nem kód. (Vegyes nyelvű kód olvashatatlan, és a
  portfólió-szemlélőnek is angolul kell értenie.)
- Karbantarthatóság a puszta "működik" felett: ha valami rejtett feltételre
  épül (betöltési sorrend, verziófüggő viselkedés, DOM-sorrend), tedd
  explicitté — konkrét érték + rövid komment a kényszerről. (Tanulság: a régi
  kód CSS-sorrend- és z-index-döntetlenekre épített, amik némán elromlottak.)
- **Ne az egyszerűség vezérelje az AJÁNLÁST a helyesség rovására.** Amikor két
  megoldás közül az egyszerűbb egyben a gyengébb is (kevésbé pontos, lazább,
  kevésbé karbantartható, összemos külön természetű eseteket), a HELYESEBBET
  ajánld. Az egyszerűbbet csak KIMONDOTT kompromisszumként, az árával együtt add
  elő — sosem az alapértelmezett javaslatként. A mérleg KIMONDÁSA a dolgom, nem az
  egyszerű felé billentése; a felhasználó dönthet az egyszerűbb mellett, de a
  javaslat ne rejtse el a helyesebb opciót. (Tanulság, 2026-09-14: az
  írás-védelem méretezésénél kétszer egymás után a gyengébbet ajánlottam „az
  egyszerűség kedvéért" — egy közös rate-limit-vödröt a művelet-természethez
  szabott kettő helyett, majd egy per-account kvótát a per-section helyett; mind
  a kettőt a felhasználó javította.)
- **Az `as` NEM ellenőrzés.** A TypeScript `as` (és a `querySelector<T>`-stílusú
  típusparaméter, meg a `!` non-null jel) nem vizsgál semmit: közli a fordítóval,
  hogy higgyen nekünk. Ha az érték mégis más alakú, senki nem szól — vagyis egy
  `as`-szal pont azt a néma hibát engedjük vissza, ami ellen a típusok vannak.
  Ahol egy ismeretlen (`unknown`) érték alakjától függ a viselkedés, oda **valódi
  futásidejű ellenőrzés** kell: `typeof` / `in` / `instanceof`, saját típusőr
  függvényben, teszttel. (Példa: `src/httpError.ts` — a 401-kiléptetés és a
  hibanaplózás alak-vizsgálata; korábban két külön `as` állította ugyanezt.)
  Az `as const` KIVÉTEL: az nem állítás egy értékről, hanem a literál típus
  megőrzése, és a fordító ellenőrzi.
- **A GENERIKUS HÍVÁS UGYANEZ, csak nem látszik rajta.** A `fn<T>(…)` alakú hívás
  — `handleAxios<Quote[]>(…)`, `axios.post<T>(…)`, `useState<T>()`,
  `querySelector<T>(…)` — nem vizsgál semmit: a `T`-t a HÍVÓ mondja meg, és a
  fordító elhiszi. Ha a válasz mégis más alakú, senki nem szól. Ez a legalattomosabb
  formája a hitnek, mert *úgy néz ki*, mint egy típusellenőrzés.
  **Szabály: ami a programon KÍVÜLRŐL jön (szerver-válasz, süti, localStorage,
  env, JSON.parse), az `unknown`, és a hívó VALÓDI ellenőrzéssel szűkíti.**
  Az `unknown` nem kényelmetlenség, hanem a kapu: hozzá nem lehet nyúlni
  ellenőrzés nélkül, tehát nem lehet elfelejteni. A minták, mind működő kód:
  - séma-ellenőrzés a szerver válaszaira: `frontend/src/types/api.ts` (valibot;
    a típusok a sémából SZÁRMAZNAK, nincs kézzel írt párhuzamos leírás) — a
    hívók `v.parse(séma, response.data)`-val szűkítenek;
  - kézzel írt típusőr, ahol nem kell séma: `frontend/src/httpError.ts`;
  - süti: `frontend/src/contexts/auth.tsx` (a token `v.safeParse`-szal);
  - env: `frontend/src/vite-env.d.ts` (a `ViteTypeOptions.strictImportMetaEnv`
    nélkül minden env-kulcs `any` marad!) + `frontend/src/backendUrl.ts` (a
    hiányzó értéket a típus nem fogja meg, ezért induláskori ellenőrzés is kell).
- **Kezdőérték ≠ típus.** Ahol egy `useState`, `useRef` vagy modul-szintű változó
  `null`-lal (vagy üres tömbbel) indul, ott a típus KIMONDOTTAN járjon mellé
  (`useState<AccentOverride | null>(null)`). A fordító különben a kezdőértékből
  következtet, és a változót örökre `null`-ra szűkíti. Ez hangos hiba (az első
  értékadás elhasal), de a szabály elébe megy.
- **NE SEGÍTS A TÁMADÓNAK — a minimális felfedés elve (least disclosure).** A
  szolgáltatás egy kívülálló szemszögéből ELLENSÉGES felület: mindent, ami kimegy
  rajta (hibaüzenet, státuszkód, fejléc, válaszidő, a válasz PUSZTA LÉTE), egy
  támadó információként olvas. Az alapállás ezért: adjunk ki pontosan annyit,
  amennyi a JOGOS használathoz kell, és semmivel se többet — még akkor sem, ha a
  „többet" kimondása kényelmesebb vagy beszédesebb. A kérdés minden kimenő adatnál
  ez: *mit tanul ebből valaki, aki ellenünk dolgozik, és tényleg meg kell-e ezt
  tudnia?* Konkrét formái, mind ÉLES gyakorlat itt:
  - **Hiba: a részlet a naplóba, a kliensnek általános üzenet.** Séma-mezőnév,
    ORM-név, verzió, stack trace, kapcsolati URI — ezek térkép a támadónak, a
    felhasználónak semmit nem mondanak (`serverError.js`; a forrás-map `.map`-kérés
    404, `app.js`).
  - **Ne szivárogtass LÉTEZÉST/FELSOROLÁST.** Azonos üzenet+státusz ismeretlen
    névre és rossz jelszóra, hangolt válaszidővel (álca-hash, `login.js`);
    „nincs ilyen elem" és „van, de nem a tiéd" ugyanaz a 403 (`ownership.js`); a
    rate-limit válasza sem árulja el, létezik-e a fiók (`routes.js`).
  - **A kimenő csatornák konkrét szabályai a 7–9. pontban** (válasz-whitelist,
    napló-injekció, a napló-tartalom redakciója) — azok ENNEK az elvnek a példái.
  - **A hallgatás is felület.** Egy verbózus keretrendszer-alapértelmezés (pl. a
    beépített 404 „Cannot POST …", ami ujjlenyomatot ad és visszatükrözi az utat),
    egy fejléc, egy időzítés-különbség — mind felfed valamit anélkül, hogy szántuk
    volna. A hiányzó szándékos válasz helyére a keret sajátja lép: azt is nézd.
  ⚠ Ez az elv EGYENSÚLYOZ, nem tilt: a hibának a MI oldalunkon (napló) továbbra is
  teljesnek kell lennie (a stack megőrzése kontroll, l. 8. pont), és a
  monitorozásnak/mentésnek járó adat kimehet — a felfedést a KÍVÜLÁLLÓ felé
  minimalizáljuk, nem magunk elől. (Elv rögzítve 2026-09-17, a felhasználó
  megfigyeléséből: „a bot ellenünk van, minek segítünk neki".)
- **A NÉMÁN ELROMLÓ MINTÁK — ellenőrizendők, valahányszor a kód ilyet érint.**
  Ezek nem elméleti kockázatok: mindegyik előfordult már itt, vagy egy audit
  találta meg. Közös bennük, hogy semmi nem hibázik — csak az eredmény rossz.
  Új kód írásakor és felülvizsgálatkor ezekre külön rá kell nézni:
  1. **Kétoldali kötés, amit csak komment tart.** Ha egy érték a frontendben és a
     backendben is szerepel (token-lejárat, jelszó-szabály, tartományok,
     alapértékek), semmilyen eszköz nem látja az elcsúszásukat. Kell hozzá
     szerződés-teszt: `backend/src/frontendContract.test.js` a minta — az
     ÉRTÉKET nem rögzíti, csak az egyezést.
  2. **Az auth-határ.** A `routes.js`-ben az `router.use(auth)` FÖLÉ került új
     útvonal azonnal publikus, némán. Őre: `backend/src/authBoundary.test.js`
     (forrás-sorrend + viselkedés). A `PUBLIC_ROUTES` lista bővítése indokkal jár.
  3. **Versenyhelyzet a betöltő effektekben.** Két párhuzamos válasz fordított
     sorrendben is visszaérhet, és a RÉGI felülírhatja a frisset. Minta a
     `useSortableCards.ts` `active`-jelzője; minden `handleAxios`-t hívó effektnek
     kell ilyen, ha újra tud futni (változó paraméter, pl. `:id`).
     **A debounce NEM őr**: a `clearTimeout` a még el nem sült IDŐZÍTŐT vonja
     vissza, a már elindult kérést nem.
     **És az őr mellé TESZT is kell** — az őr egyetlen `if (!active) return;` sor,
     amit egy refaktor némán kivehet: nem esik szét semmi, a tesztek zöldek
     maradnak. Minta: `Todos/save.test.tsx` és
     `Quotes/save.test.tsx` "versenyhelyzet a betöltésben" blokkjai — a mockolt
     `handleAxios` GYŰJTI a callbackeket ahelyett, hogy válaszolna, a paraméter-
     váltás a böngésző Vissza gombjával megy (`pushState` ×2 +
     `history.back()` — a route `key`-e ugyanaz, tehát nincs remount), és a teszt
     süti el a válaszokat fordított sorrendben. A hibaág külön teszt: a lejárt
     hiba ne navigáljon ki a szerkesztőből. **A teszt csak MUTÁCIÓ-PRÓBÁVAL
     kész**: az adott `if (!active) return;` kivételére pontosan a hozzá tartozó
     teszt bukjon, más ne.
  4. **Bedrótozott kiterjesztés és útvonal.** Fájlokat kiterjesztés szerint szűrő
     kód (`.js`) a TS-átállás alatt NÉMÁN kihagy fájlokat — l.
     `scripts/exportSections.js`. Fájlra hivatkozó tesztek kiterjesztés nélkül
     oldják fel a nevet.
  5. **Kézzel szinkronizált másolat.** Ami két helyen él (systemd-unit az
     `/etc`-ben és a `deploy/`-ban, env-kulcs a kódban és az `.env.example`-ben),
     az el fog csúszni. Ha nem lehet egy példány, akkor ellenőrzés kell rá — a
     unitokat a napi Pi-állapotellenőrzés hasonlítja össze.
  6. **A KÜLSŐ ÉRTÉK BEÁLLÍTÁSAI, nem csak a tartalma.** Egy süti (vagy bármi,
     amit egy könyvtárnak adunk át) nem csak akkor romlik el, ha az ÉRTÉKE rossz:
     a HIÁNYZÓ beállítás is némán mást jelent. A `{path: "/"}`-vel írt süti
     lejárat nélküli, azaz munkamenet-süti — a téma-választás így minden
     böngésző-bezárásnál elveszett, hibaüzenet nélkül. Az ilyen beállítás
     `document.cookie`-ból VISSZA SEM OLVASHATÓ, tehát csak ott kérhető számon,
     ahol átadjuk: `frontend/src/cookies.ts` (a szándék kimondva:
     `SESSION_COOKIE` vs. `PERSISTENT_COOKIE`) + a rájuk írt tesztek.
  7. **A KIFELÉ MENŐ DOKUMENTUM-VÁLASZ WHITELIST, nem a teljes doksi.** Ami a
     `response.json(doc)`-kal kimegy, az alapból a TELJES Mongoose-dokumentum: a
     tulajdonos (`user`), a `__v` és az időbélyegek is — és egy jövőbeli ÉRZÉKENY
     séma-mező is, magától, némán. Ezért minden szekció-modell `toJSON`-ja
     WHITELIST (l. `backend/src/publicJson.js`): csak a hálózatra szánt
     mezőket adja ki, új mező nem szivárog. A whitelist PÁRJA a frontend
     valibot-sémája (`frontend/src/types/api.ts`), a kettőt EGYÜTT kell mozgatni —
     a veszélyes irányt (kiesik egy kellő mező) a `v.parse` fogja (szerződés-hiba a
     naplóba). ⚠ A `toJSON` CSAK a JSON-t szűkíti; a napi export `.lean()`-nel
     olvas, azt NEM érinti — a mentésnek a TELJES doksi kell (a mentés feltétel
     nélkül mindent visz). Az egy-elemes végpontok ezen felül kézi, még
     szűkebb whitelistet adhatnak (`Quotes/readForEdit.js`).
  8. **A KIFELÉ MENŐ SZÖVEG SZERKEZETE, nem csak a tartalma (napló-injekció).**
     A napló-kapu (`backend/src/log.js`) a titkok TARTALMÁT redaktálja, de egy
     kívülről jövő SORTÖRÉS ÚJ naplósort nyit — a támadó hamis bejegyzést költhet a
     journalba (»log injection«). MÉRVE (2026-09-13): az `express.json` a hibás
     törzs egy darabját beidézi a `SyntaxError` üzenetébe, sortörésestül, és az a
     `serverError → logError` úton, HITELESÍTÉS NÉLKÜL a naplóba kerül. A védelem a
     KAPUNÁL van (`neutralizeControls`): a KÍVÜLRŐL jövő rész (a hiba `message`-e, a
     `logInfo` interpolált értékei) vezérlőkaraktereit escape-eljük. ⚠ SEBÉSZILEG:
     csak a külső szövegre, NEM a teljes sorra — a saját, SZÁNDÉKOSAN többsoros
     tartalmunk (a verem keret-sorai) maradjon ép, különben a stack trace
     olvashatatlan lesz (l. `describeError`: a `message`-t a vermen belül célzottan
     cseréli; `log.test.js` a verem-megőrzést KONTROLLKÉNT is állítja). Ugyanez a
     »log injection« ellen a `/client-error` kulcs-validátora lokálisan is véd.
  9. **AZ ENGEDÉLYEZETT MEZŐNÉV NEM ELLENŐRZÖTT ÉRTÉK.** Ha egy validátor
     mezőneveket enged át egy allow-listával (`TASK_FIELDS`), az még nem mondja meg,
     mi lehet a mező ÉRTÉKE. A `task.id` így sokáig szabadon hordozhatott tetszőleges
     típusú/méretű adatot: az ismeretlen-mező-szűrő átengedte (a név engedélyezett),
     a tartalmát viszont senki nem nézte — onnan a tárba és az exportba is átfolyt
     volna. Minden engedélyezett mező ÉRTÉKÉT is kösd meg (alak/hossz/típus); l.
     `backend/src/middleware/validateTodo.js` (`task.id !== key`, `TASK_ID`).
- **`ELTÉRÉS`-komment**: ahol egy szekció (to-do, idézet, később film…) SZÁNDÉKOSAN
  másképp működik, mint a párja, azt kommentben jelöljük, az `ELTÉRÉS` szóval
  kezdve — így `grep "ELTÉRÉS"`-sel az összes tudatos elhajlás előkereshető.
  Három kötelező eleme van: **mitől** tér el (a párja konkrét fájlneve), **miben**,
  és **miért**. Indoka: két párhuzamos szekció között az olvasó nem tudja
  megkülönböztetni a tudatos döntést az elfelejtett átvezetéstől — csak a komment
  dönti el. (Ha az eltérésnek nincs jó indoka, az nem komment-, hanem javítás-kérdés.)
