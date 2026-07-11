# CLAUDE.md

Ez a fájl útmutatást ad a Claude Code-nak ehhez a projekthez.

## Projekt célja

Egy 2022-es szakdolgozat-projekt (React + Express + MongoDB to-do app) **portolása**
Raspberry Pi 4B-re, MongoDB helyett FerretDB-vel, és bővítése több-kategóriás
rendszerré (to-do-n túl: filmek, sorozatok, idézetek, jegyzetek, könyvek, egyéb
könyvjelzők). Portfólió-darab újbóli webfejlesztői álláskereséshez — a kód, a git
history és a dokumentáció bemutatható minőségű kell legyen.

**Fontos**: nem újraírás, hanem port — a régi design (CSS/Bootstrap) és a
komponensek nagy része átkerül, csak az új backend és kategóriák köré bővül.

## Régi projekt (referencia, portoláshoz)

- Backend: https://github.com/griffffffin/to-do-backend
- Frontend: https://github.com/griffffffin/to-do-frontend
- Ismert gyengeség a régiben, amit itt javítani kell: user-azonosítás kliens-oldali
  cookie-ból megy, nincs szerveroldali session-ellenőrzés (JWT/signed session kell
  helyette).

## Hardver / környezet

- Raspberry Pi 4B, 4 mag, 7.6GB RAM, Ubuntu (kernel 6.8), `/opt/to-do` alatt fut a projekt
- Node.js v22.22.1
- FerretDB **v2.7.0** systemd service-ként fut (`ferretdb.service`,
  `/usr/bin/ferretdb`), a `127.0.0.1:27017` címen figyel. Háttértár:
  PostgreSQL 16 a DocumentDB extensionnel (`postgres` adatbázis). A MongoDB-
  kliensek (backend) hitelesítéssel kapcsolódnak, a Postgres-user adataival.
- A FerretDB Postgres-jelszava a `/etc/ferretdb.env`-ben él (root:root, 600),
  a unit `EnvironmentFile=`-lal tölti be — parancssorban/`ps`-ben nem látszik.
  (A korábbi plaintext-jelszavas állapot 2026-07-11-én javítva, jelszó cserélve.)
- Titokkezelési elv: projektenként külön env-fájl (least privilege) — a to-do
  backend titkai a `backend/.env`-be (600, gitignore-olva), NEM más projektek
  közös titokfájljába.

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
- Adatmodell: **kategóriánként külön tábla/collection**, nem egy közös polimorf
  tábla. Alkategóriák (pl. film műfaja) NEM külön táblák, hanem oszlop az adott
  kategória tábláján belül, amire az URL-routing szűr (pl. `/movies/comedy` a
  `movies` tábla `genre` oszlopára szűrt nézet).
- URL-struktúra: egy domain, kategóriánkénti route-ok (`/movies/comedy`, `/series`,
  `/books`, `/thoughts`, stb.)
- Ismert kategóriák eddig: movies (cím, évszám, genre), quotes (szerző, idézet
  szövege) - a többi (jegyzetek, sorozatok, könyvek, egyéb könyvjelzők) mezői
  menet közben tisztázandók.
- A legtöbb kategória-oldalra NEM kell kategória-/színválasztó és percentage
  (ezek a to-do sajátjai) — még nem implementálandó, csak tervezési tény.
- Skálakövetelmény: egyes kategóriákban (pl. könyvjelzők) akár ~10 000 elem —
  a kategória-nézetekhez szerveroldali lapozás/keresés és indexek kellenek,
  a "mindent letölt és egyben renderel" minta ott nem játszik.

## Migrációs buktatók

- A régi kód `process.env.REACT_APP_*`-ot használ (CRA-konvenció) - Vite-nál ez
  `import.meta.env.VITE_*`, NEM 1:1 másolható át.
- Vite csak `.jsx` kiterjesztésű fájlban fordít JSX-et — a régi `.js`
  komponensfájlokat portoláskor át kell nevezni `.jsx`-re.

## Biztonsági mentés

- Napi export CSV-be, DE csak ha aznap tényleg történt módosítás
- Heti teljes biztonsági mentés, külön réteg a napi exporttól

## Terítés (deployment)

Egyelőre csak helyi (Pi-n futó) verzió a cél. Online elérhetőség részletei egy
későbbi, külön beszélgetés témája.

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
- Karbantarthatóság a puszta "működik" felett: ha valami rejtett feltételre
  épül (betöltési sorrend, verziófüggő viselkedés, DOM-sorrend), tedd
  explicitté — konkrét érték + rövid komment a kényszerről. (Tanulság: a régi
  kód CSS-sorrend- és z-index-döntetlenekre épített, amik némán elromlottak.)
