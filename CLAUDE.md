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

## Lemeztitkosítás (KÉSZ, 2026-07-12)

- A teljes `/opt` — tehát az app, az adatbázis adatkönyvtára és a mentések is —
  **titkosított köteten** él. Fenyegetésmodell: ellopott, **kikapcsolt** gép; a
  lemezről az adat nem olvasható ki. Az OS maga titkosítatlan (nincs benne
  személyes adat).
- **A kulcs SEHOL nincs a gépen**, ezért a kötet bootkor nem csatolódik, és a rá
  épülő szolgáltatások auto-indítása le van tiltva. Reboot után kézzel kell
  feloldani (`sudo unlock-opt`) — a szkript a gépen él, **szándékosan nem a
  repóban**: gépspecifikus üzemeltetés, amit rajta kívül senki nem tud
  használni, viszont pontosan leírná ennek a gépnek a belső elrendezését.
  Ugyanez az elv, amiért a mentés-lehúzó szkriptek is a repón kívül vannak.
- **Fejlesztéskor figyelj**: feloldás nélkül a `/opt` üres könyvtárnak látszik —
  az sshfs-mount is üreset csatolna. Nem hibaüzenetet kapsz, hanem semmit.

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
     maradnak. Minta: `Quotes/public.test.tsx`, `Todos/save.test.tsx`,
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
- **`ELTÉRÉS`-komment**: ahol egy szekció (to-do, idézet, később film…) SZÁNDÉKOSAN
  másképp működik, mint a párja, azt kommentben jelöljük, az `ELTÉRÉS` szóval
  kezdve — így `grep "ELTÉRÉS"`-sel az összes tudatos elhajlás előkereshető.
  Három kötelező eleme van: **mitől** tér el (a párja konkrét fájlneve), **miben**,
  és **miért**. Indoka: két párhuzamos szekció között az olvasó nem tudja
  megkülönböztetni a tudatos döntést az elfelejtett átvezetéstől — csak a komment
  dönti el. (Ha az eltérésnek nincs jó indoka, az nem komment-, hanem javítás-kérdés.)
