/* Napi JSON-export — éjfélkor fut (notes-export.timer), ezért az ELŐZŐ napot
   vizsgálja: csak akkor ír fájlt (az előző nap dátumával), ha aznap volt
   módosítás. JSON, mert az adat beágyazott (tasks, később alsorok) — ezt a
   CSV nem viszi hűen. Régi exportot csak akkor töröl, ha van nála frissebb,
   nem üres mentés.

   MINDEN szekciót ment, nem csak a to-dót: szekciónként KÜLÖN fájlba
   (to-dos-DATE.json, quotes-DATE.json…), külön módosítás-vizsgálattal és
   retencióval. Hogy MELYIK szekciókat, azt nem itt soroljuk fel: a modellek
   mondják meg magukról (exportSections.js). */
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
/* Az env-et a Node tölti a `--env-file`-lal (l. deploy/notes-export.service ExecStart:
   `node --env-file=.env scripts/daily-export.js`, WorkingDirectory=/opt/notes/backend).
   Korábban itt `dotenv` állt; leváltva a natív kapcsolóra (l. src/app.js indoklása).
   Kézi futtatáshoz: `node --env-file=.env scripts/daily-export.js` a backend gyökeréből. */
const {discoverSections} = require("./exportSections");
const {enrollmentRecord} = require("./exportEnrollment");
const Users = require("../src/models/users");
const {localDateString} = require("../src/localDate");

/* FIGYELEM: ez egy VALÓDI, a gépen létező könyvtár neve, nem kódbeli azonosító —
   átnevezni csak a gépen lévő könyvtárral EGYÜTT szabad. (Egy többesszámosító
   refaktor egyszer "to-dos"-ra írta át, amitől a napi mentés némán kimaradt: a
   szolgáltatás elhasalt, de ezt csak a journal tudta.) A testvére a heti mentés
   könyvtára a deploy/weekly-backup.sh-ban — a kettő közös gyökerét a
   backupPaths.test.js őrzi. */
const EXPORT_DIR = process.env.EXPORT_DIR || "/opt/backups/notes/daily";
// Szekciónként ennyi LEGFRISSEBB exportfájlt tartunk meg, a többit töröljük.
const RETENTION_COUNT = 30;

/* Kinek az adatait mentjük. Az azonosító a .env-ből jön, NEM a kódból:

   Egy ObjectId nem a program része, hanem EZ a gép EZ a telepítése — ugyanolyan
   gépfüggő adat, mint az IP-cím, ami szintén nincs a repóban. A repo publikus lesz:
   egy odaírt azonosító a szemlélőnek semmit nem mond, és hazudna abban a
   pillanatban, amikor a fiókot újra kellene hozni.

   Ha nincs megadva, MINDEN elem exportálódik — ez volt a régi viselkedés, és
   így a szkript egy másik telepítésen is használható marad, ahol nincs ilyen
   szűkítés. */
const EXPORT_USER_ID = process.env.EXPORT_USER_ID || null;
const scope = EXPORT_USER_ID ? {user: EXPORT_USER_ID} : {};

/* Egy szekció exportja az előző napra: csak akkor ír fájlt, ha a saját
   táblájában volt aznapi módosítás. A szűkítés a countDocuments-ben IS kell,
   nem csak a find-ban: enélkül egy MÁSIK fiók módosítása indítana exportot a mi
   változatlan adatunkról — nap mint nap ugyanaz a fájl, más néven. */
async function exportSection(section, startOfWindow, endOfWindow) {
    const changed = await section.model.countDocuments(
        {...scope, updatedAt: {$gte: startOfWindow, $lt: endOfWindow}});
    if (changed === 0) {
        console.log(`[${section.name}] Az előző napon nem volt módosítás — nincs export.`);
        return;
    }
    const documents = await section.model.find(scope).sort("user order").lean();
    /* A fájlnév dátuma a VIZSGÁLT nap, HELYI idő szerint (l. localDate.js). Az
       ISO-alak itt egy napot visszalépne: a helyi éjfél UTC-ben az előző nap
       22:00 (nyáron), amitől a mentés címkéje hazudna egy napot. */
    const file = path.join(EXPORT_DIR,
        section.name + "-" + localDateString(startOfWindow) + ".json");
    /* 0640: az export a felhasználó adatait tartalmazza, tehát MÁSNAK semmit — de a
       CSOPORTNAK olvashatónak kell lennie. A könyvtár setgid bites és a csoportja az
       a felhasználó, aki a mentést a másik gépre lehúzza (deploy/setup-backup-permissions.sh),
       így az itt született fájl automatikusan az ő csoportjába kerül.

       KORÁBBAN 0600 ÁLLT ITT, és az akkor helyes volt: az exportot ugyanaz a
       felhasználó írta, aki lehúzta. 2026-08-22-én az export külön szolgáltatás-
       felhasználóra került (deploy/notes.service), és ezzel a 0600 NÉMÁN elvágta
       volna a mentés-lehúzást — a fájl megszületik, a szkript sikert jelent, csak
       a másik gép nem tudja elolvasni. Mérve, kézi próbán derült ki. */
    fs.writeFileSync(file, JSON.stringify(documents, null, 2) + "\n", {mode: 0o640});
    fs.chmodSync(file, 0o640);   // ha a fájl már létezett, a writeFileSync mode-ja nem érvényesül
    console.log(`[${section.name}] ${documents.length} dokumentum exportálva: ${file}`);
}

/* Retenció EGY szekcióra: a RETENTION_COUNT legfrissebb fájlt tartjuk meg, a
   többit töröljük — DE csak akkor, ha a szekció legfrissebb mentése érvényes,
   nem üres JSON-tömb (legalább egy elemmel): üres/hibás friss mentés ne
   tüntethesse el a még adatot őrző régieket. A szűrés a szekció fájlnév-
   előtagjára megy, hogy a szekciók retenciója NE keveredjen (a quotes friss
   mentése ne törölhessen régi to-dos-fájlt). */
function retainSection(section) {
    const prefix = section.name + "-";
    const files = fs.readdirSync(EXPORT_DIR)
        .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
        .map((name) => ({name, path: path.join(EXPORT_DIR, name)}))
        .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);   // legfrissebb elöl
    if (files.length <= RETENTION_COUNT) return;

    let newestHasData = false;
    try {
        const parsed = JSON.parse(fs.readFileSync(files[0].path, "utf8"));
        newestHasData = Array.isArray(parsed) && parsed.length >= 1;
    } catch { newestHasData = false; }

    if (!newestHasData) {
        console.log(`[${section.name}] A legfrissebb export üres vagy hibás — retenciós törlés kihagyva.`);
        return;
    }
    // A RETENTION_COUNT legfrissebbet megtartjuk (a lista elején), a többit töröljük.
    for (const file of files.slice(RETENTION_COUNT)) {
        fs.unlinkSync(file.path);
        console.log(`[${section.name}] Régi export törölve: ${file.name}`);
    }
}

/* A BEIRATKOZÁS EXPORTJA — a mentés ÖNMAGÁBAN visszafejthetőségéhez (l. exportEnrollment.js
   és [[offline-restorable-backups]]). Külön a szekció-exporttól: a beiratkozás nem szekció
   (nincs napi módosítás-ablaka, nem idősor, hanem jelenállapot), ezért stabil néven,
   retenció nélkül írjuk, és csak ha nem üres — üres/félkész fájl ne írja felül a jót.

   ELTÉRÉS a szekció-exporttól (daily-export.js szekció-ága): EXPORT_USER_ID NÉLKÜL a szekció-
   export „mindenki"-re esik, a beiratkozás-export viszont KIHAGYJA magát. Indok: a beiratkozás
   kulcsanyag (bár a jelszó nélkül haszontalan), a felesleges kitettséget minimalizáljuk, és a
   decrypt-export úgyis EGY fiók rekordját várja — minden fiók kulcsanyagának egy fájlba
   dumpolása se nem kell, se nem kívánatos. */
async function exportEnrollment() {
    if (!EXPORT_USER_ID) {
        console.log("Nincs EXPORT_USER_ID — a beiratkozás-export kihagyva (nem dumpolunk minden fiók kulcsanyagát).");
        return;
    }
    const user = await Users.findById(EXPORT_USER_ID).lean();
    const record = enrollmentRecord(user);
    if (!record) {
        console.log("A fiók nincs E2EE-beiratkozva — nincs beiratkozás-export (a régi mentések nyíltak).");
        return;
    }
    const file = path.join(EXPORT_DIR, "enrollment.json");
    // 0640, mint a szekció-fájlok: a csoport (a mentés-lehúzó) olvassa, más senki.
    fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n", {mode: 0o640});
    fs.chmodSync(file, 0o640);   // ha a fájl már létezett, a writeFileSync mode-ja nem érvényesül
    console.log(`Beiratkozás exportálva: ${file}`);
}

(async () => {
    /* A felderítés a kapcsolat ELŐTT fut, de a hibái NEM állítják meg a mentést:
       ami nyilatkozott, azt lementjük, és a hibás/hiányzó nyilatkozatokkal a
       futás VÉGÉN szállunk el (l. lentebb). Egy elfelejtett nyilatkozat így nem
       viszi magával a többi szekció aznapi mentését. */
    const {sections, errors} = discoverSections();
    console.log(`Mentendő szekciók: ${sections.map((section) => section.name).join(", ") || "egy sem"}`);

    await mongoose.connect(process.env.DATABASE);
    console.log(EXPORT_USER_ID ? "Szűkítve egy felhasználóra." : "Minden felhasználó adata (nincs EXPORT_USER_ID).");

    const endOfWindow = new Date();
    endOfWindow.setHours(0, 0, 0, 0);
    const startOfWindow = new Date(endOfWindow.getTime() - 24 * 60 * 60 * 1000);

    for (const section of sections) {
        await exportSection(section, startOfWindow, endOfWindow);
        retainSection(section);
    }

    await exportEnrollment();

    await mongoose.disconnect();

    /* A hibák a MENTÉSEK UTÁN buknak ki, de ki kell bukniuk: a nem-nulla kilépési
       kódtól a systemd hibás futásként naplózza a notes-export.service-t, tehát a
       hiányzó nyilatkozat nem tűnik el csak azért, mert a többi szekció mentése
       sikerült. Ez a "hangos, de nem pusztító" viselkedés lényege. */
    if (errors.length > 0) {
        for (const message of errors) console.error("Export hiba:", message);
        process.exit(1);
    }
})().catch((error) => {
    console.error("Export hiba:", error.message);
    process.exit(1);
});
