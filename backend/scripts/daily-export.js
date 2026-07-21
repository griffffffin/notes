/* Napi JSON-export — éjfélkor fut (todo-export.timer), ezért az ELŐZŐ napot
   vizsgálja: csak akkor ír fájlt (az előző nap dátumával), ha aznap volt
   módosítás. JSON, mert az adat beágyazott (tasks, később alsorok) — ezt a
   CSV nem viszi hűen. Régi exportot csak akkor töröl, ha van nála frissebb,
   nem üres mentés.

   MINDEN kategóriát ment, nem csak a to-dót: kategóriánként KÜLÖN fájlba
   (todos-DATE.json, quotes-DATE.json…), külön módosítás-vizsgálattal és
   retencióval. Egy új kategória bevétele így egyetlen sor a CATEGORIES-ben. */
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({path: path.join(__dirname, "../.env")});
const Todo = require("../src/models/todo");
const Quote = require("../src/models/quote");

const EXPORT_DIR = process.env.EXPORT_DIR || "/opt/backups/to-do/daily";
const RETENTION_DAYS = 30;

/* A mentendő kategóriák: a fájlnév-előtag és a Mongoose-modell. A sort "user
   order" mindegyiknél működik (mindnek van user + order mezője), és determinista
   sorrendet ad, hogy a napi fájlok diffelhetők legyenek. */
const CATEGORIES = [
    {name: "todos", model: Todo},
    {name: "quotes", model: Quote},
];

/* Kinek az adatait mentjük. Az azonosító a .env-ből jön, NEM a kódból:

   Egy ObjectId nem a program része, hanem EZ a gép EZ a telepítése — ugyanaz a
   kategória, mint az IP-cím, ami szintén nincs a repóban. A repo publikus lesz:
   egy odaírt azonosító a szemlélőnek semmit nem mond, és hazudna abban a
   pillanatban, amikor a fiókot újra kellene hozni.

   Ha nincs megadva, MINDEN elem exportálódik — ez volt a régi viselkedés, és
   így a szkript egy másik telepítésen is használható marad, ahol nincs ilyen
   szűkítés. */
const EXPORT_USER_ID = process.env.EXPORT_USER_ID || null;
const scope = EXPORT_USER_ID ? {user: EXPORT_USER_ID} : {};

/* Egy kategória exportja az előző napra: csak akkor ír fájlt, ha a saját
   táblájában volt aznapi módosítás. A szűkítés a countDocuments-ben IS kell,
   nem csak a find-ban: enélkül egy MÁSIK fiók módosítása indítana exportot a mi
   változatlan adatunkról — nap mint nap ugyanaz a fájl, más néven. */
async function exportCategory(category, startOfWindow, endOfWindow) {
    const changed = await category.model.countDocuments(
        {...scope, updatedAt: {$gte: startOfWindow, $lt: endOfWindow}});
    if (changed === 0) {
        console.log(`[${category.name}] Az előző napon nem volt módosítás — nincs export.`);
        return;
    }
    const documents = await category.model.find(scope).sort("user order").lean();
    const file = path.join(EXPORT_DIR,
        category.name + "-" + startOfWindow.toISOString().slice(0, 10) + ".json");
    // 0600: az export a felhasználó adatait tartalmazza — csak a tulajdonos olvashassa
    fs.writeFileSync(file, JSON.stringify(documents, null, 2) + "\n", {mode: 0o600});
    fs.chmodSync(file, 0o600);   // ha a fájl már létezett, a writeFileSync mode-ja nem érvényesül
    console.log(`[${category.name}] ${documents.length} dokumentum exportálva: ${file}`);
}

/* Retenció EGY kategóriára — de régi fájlt csak akkor törlünk, ha annak a
   kategóriának a legfrissebb mentése érvényes, nem üres JSON-tömb (legalább egy
   elemmel): üres/hibás friss mentés ne tüntethesse el a még adatot őrző régieket.
   A szűrés a kategória fájlnév-előtagjára megy, hogy a kategóriák retenciója NE
   keveredjen (a quotes friss mentése ne törölhessen régi todos-fájlt). */
function retainCategory(category) {
    const prefix = category.name + "-";
    const files = fs.readdirSync(EXPORT_DIR)
        .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
        .map((name) => ({name, path: path.join(EXPORT_DIR, name)}))
        .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);
    if (files.length === 0) return;

    let newestHasData = false;
    try {
        const parsed = JSON.parse(fs.readFileSync(files[0].path, "utf8"));
        newestHasData = Array.isArray(parsed) && parsed.length >= 1;
    } catch { newestHasData = false; }

    if (!newestHasData) {
        console.log(`[${category.name}] A legfrissebb export üres vagy hibás — retenciós törlés kihagyva.`);
        return;
    }
    const limit = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const file of files) {
        if (fs.statSync(file.path).mtimeMs < limit) {
            fs.unlinkSync(file.path);
            console.log(`[${category.name}] Régi export törölve: ${file.name}`);
        }
    }
}

(async () => {
    await mongoose.connect(process.env.DATABASE);
    console.log(EXPORT_USER_ID ? "Szűkítve egy felhasználóra." : "Minden felhasználó adata (nincs EXPORT_USER_ID).");

    const endOfWindow = new Date();
    endOfWindow.setHours(0, 0, 0, 0);
    const startOfWindow = new Date(endOfWindow.getTime() - 24 * 60 * 60 * 1000);

    for (const category of CATEGORIES) {
        await exportCategory(category, startOfWindow, endOfWindow);
        retainCategory(category);
    }

    await mongoose.disconnect();
})().catch((error) => {
    console.error("Export hiba:", error.message);
    process.exit(1);
});
