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

- A teljes `/opt` egy **LUKS2-titkosított köteten** él (fájl-alapú konténer a
  rendszerlemezen; a Postgres adatkönyvtára is ide költözött: `a titkosított köteten`).
  Fenyegetésmodell: ellopott, **kikapcsolt** gép — a lemezről az adat nem
  olvasható ki. Az OS maga titkosítatlan (nincs benne személyes adat).
- **A kulcs SEHOL nincs a gépen** — ezért a `/opt` bootkor NEM csatolódik, és a
  rá épülő szolgáltatások (postgres, ferretdb, notes) auto-indítása
  le van tiltva. Reboot után kézzel kell feloldani:
  `sudo unlock-opt` (a szkript a `a gépen élő telepített szkript` verziózott mása;
  bekéri a LUKS-jelszót, csatol, majd elindítja a szolgáltatásokat).
  A verziózott szkript CSAK a projekt saját láncát ismeri (postgres, ferretdb,
  notes) — hogy a publikus repó ne dokumentálja, mi fut még ezen a gépen. A
  teljes, gépspecifikus lista az `egy gépspecifikus, nem verziózott beállítófájl`-ban él
  (`SERVICE_LIST`, `STATUS_SERVICE_LIST`), ami NEM verziókezelt; ha új
  /opt-os szolgáltatás jön, oda kell felvenni.
- **Fejlesztéskor figyelj**: feloldás nélkül a `/opt` üres könyvtárnak látszik —
  az sshfs-mount is üreset csatolna.

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
  felső szint kódbeli neve `section` (l. `Navbar/sectionSwitcher.jsx`,
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
- **`ELTÉRÉS`-komment**: ahol egy szekció (to-do, idézet, később film…) SZÁNDÉKOSAN
  másképp működik, mint a párja, azt kommentben jelöljük, az `ELTÉRÉS` szóval
  kezdve — így `grep "ELTÉRÉS"`-sel az összes tudatos elhajlás előkereshető.
  Három kötelező eleme van: **mitől** tér el (a párja konkrét fájlneve), **miben**,
  és **miért**. Indoka: két párhuzamos szekció között az olvasó nem tudja
  megkülönböztetni a tudatos döntést az elfelejtett átvezetéstől — csak a komment
  dönti el. (Ha az eltérésnek nincs jó indoka, az nem komment-, hanem javítás-kérdés.)
