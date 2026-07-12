/* Napi JSON-export — éjfélkor fut (todo-export.timer), ezért az ELŐZŐ napot
   vizsgálja: csak akkor ír fájlt (az előző nap dátumával), ha aznap volt
   módosítás. JSON, mert az adat beágyazott (tasks, később alsorok) — ezt a
   CSV nem viszi hűen. Régi exportot csak akkor töröl, ha van nála frissebb,
   nem üres mentés. */
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
require("dotenv").config({path: path.join(__dirname, "../.env")});
const Todo = require("../src/models/todo");

const EXPORT_DIR = process.env.EXPORT_DIR || "/opt/backups/to-do/daily";
const RETENTION_DAYS = 30;

(async () => {
    await mongoose.connect(process.env.DATABASE);

    const endOfWindow = new Date();
    endOfWindow.setHours(0, 0, 0, 0);
    const startOfWindow = new Date(endOfWindow.getTime() - 24 * 60 * 60 * 1000);
    const changed = await Todo.countDocuments({updatedAt: {$gte: startOfWindow, $lt: endOfWindow}});

    if (changed === 0) {
        console.log("Az előző napon nem volt módosítás — nincs export.");
    } else {
        const todos = await Todo.find({}).sort("user order").lean();
        const file = path.join(EXPORT_DIR,
            "todos-" + startOfWindow.toISOString().slice(0, 10) + ".json");
        // 0600: az export a felhasználó adatait tartalmazza — csak a tulajdonos olvashassa
        fs.writeFileSync(file, JSON.stringify(todos, null, 2) + "\n", {mode: 0o600});
        fs.chmodSync(file, 0o600);   // ha a fájl már létezett, a writeFileSync mode-ja nem érvényesül
        console.log(todos.length + " dokumentum exportálva: " + file);
    }

    /* Retenció — de régi fájlt csak akkor törlünk, ha a legfrissebb mentés
       érvényes, nem üres JSON-tömb (legalább egy elemmel): üres/hibás friss
       mentés ne tüntethesse el a még adatot őrző régieket. */
    const files = fs.readdirSync(EXPORT_DIR)
        .filter((name) => name.endsWith(".json"))
        .map((name) => ({name, path: path.join(EXPORT_DIR, name)}))
        .sort((a, b) => fs.statSync(b.path).mtimeMs - fs.statSync(a.path).mtimeMs);
    let newestHasData = false;
    if (files.length > 0) {
        try {
            newestHasData = Array.isArray(JSON.parse(fs.readFileSync(files[0].path, "utf8")))
                && JSON.parse(fs.readFileSync(files[0].path, "utf8")).length >= 1;
        } catch { newestHasData = false; }
    }
    if (newestHasData) {
        const limit = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
        for (const file of files) {
            if (fs.statSync(file.path).mtimeMs < limit) {
                fs.unlinkSync(file.path);
                console.log("Régi export törölve: " + file.name);
            }
        }
    } else if (files.length > 0) {
        console.log("A legfrissebb export üres vagy hibás — retenciós törlés kihagyva.");
    }

    await mongoose.disconnect();
})().catch((error) => {
    console.error("Export hiba:", error.message);
    process.exit(1);
});
