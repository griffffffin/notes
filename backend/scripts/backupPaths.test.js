/* A mentés-könyvtárak EGYEZÉSE három fájl között. Ez nem a kód belső logikáját
   vizsgálja, hanem egy olyan kötést, amit semmi más nem őriz: a napi export
   (JavaScript), a heti pg_dump (shell) és a jogosultság-beállító (shell)
   UGYANARRA a gyökérre hivatkozik — /opt/backups/<projekt> —, de három külön
   nyelven, három külön fájlban leírva. Se a fordító, se a linter nem látja,
   hogy ezek összetartoznak.

   A hiba, ami ellen született: egy átnevezés a JS-beli útvonalat "to-do"-ról
   "to-dos"-ra írta át, a két shell-szkriptet nem. Semmi nem jelzett — a napi
   mentés éjfélkor egyszerűen elhasalt egy nemlétező könyvtáron, és a hiány csak
   a journalban látszott, ahová senki nem néz naponta. Egy kimaradt mentés pedig
   pont akkor derül ki, amikor már kellene.

   A teszt SZÁNDÉKOSAN nem rögzíti, mi a gyökér NEVE — csak azt, hogy a három
   fájl ugyanazt mondja. Így az átnevezés továbbra is megengedett, de csak akkor,
   ha mindhárom helyen megtörténik. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const REPO_ROOT = path.join(__dirname, "../..");

/* Egy útvonal kiolvasása a fájl SZÖVEGÉBŐL. Miért szövegből, és nem a modult
   betöltve? Mert a három forrás közül kettő shell-szkript, amit JavaScriptből
   nem lehet "meghívni" — ha a JS-oldalt másképp olvasnánk, mint a shellt, a
   teszt már nem ugyanazt a kérdést tenné fel a három fájlnak. A hiányzó minta
   BUKÁS, nem kihagyás: ha valaki átírja a konstans alakját, arról tudni kell,
   mert ez a teszt attól kezdve nem őrizne semmit. */
function readDeclaredPath(relativeFile, pattern) {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativeFile), "utf8");
    const match = source.match(pattern);
    assert.ok(match, `Nem találtam a mentés-útvonalat itt: ${relativeFile} (${pattern})`);
    return match[1];
}

const dailyDir = () => readDeclaredPath("backend/scripts/daily-export.js",
    /EXPORT_DIR\s*=\s*process\.env\.EXPORT_DIR\s*\|\|\s*"([^"]+)"/);
const weeklyDir = () => readDeclaredPath("deploy/weekly-backup.sh", /^BACKUP_DIR=(\S+)$/m);
const backupRoot = () => readDeclaredPath("deploy/setup-backup-permissions.sh", /^BACKUP_ROOT=(\S+)$/m);

test("a napi export a közös mentés-gyökér alá ír", () => {
    // A jogosultság-beállító gyökere a mérce: az hozza létre a két almappát.
    assert.strictEqual(path.dirname(dailyDir()), backupRoot());
});

test("a heti mentés a közös mentés-gyökér alá ír", () => {
    assert.strictEqual(path.dirname(weeklyDir()), backupRoot());
});

/* Az almappák neve is számít: a setup-backup-permissions.sh KÜLÖN jogot ad a
   kettőnek (a daily 700 az app user-éé, a weekly 2750 setgiddel a postgresé),
   tehát egy elgépelt almappa-név nemcsak máshová írna, hanem rossz joggal is. */
test("a két mentés a saját almappájába megy (daily / weekly)", () => {
    assert.strictEqual(path.basename(dailyDir()), "daily");
    assert.strictEqual(path.basename(weeklyDir()), "weekly");
});
