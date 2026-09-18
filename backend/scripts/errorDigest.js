/* HETI NAPLÓ-ÖSSZEFOGLALÓ — a Notes journaljából, a heti e-mailhez.

   MIÉRT LÉTEZIK. Nincs (és egyelőre nem lesz) külön hibakövető: a Pi journalja a
   hibakövető (l. a döntést a memóriában/observability-backlogban). Ez a szkript a
   heti err-sorokat AGGREGÁLJA, hogy a rendszeres ránézés ember-független legyen
   (deploy/error-digest.sh + notes-error-digest.timer, vasárnap 20:00).

   ⚠ A LEGFONTOSABB SZABÁLY: A KIMENET A GMAILEN (3. FÉL) MEGY ÁT, tehát SEMMI
   ÉRZÉKENY nem kerülhet bele. Ezért a digest CSAK a következőket adja ki:
     - SZÁMOK (darabszámok),
     - a MI saját context-címkéink (pl. "Todos.update", "POST /to-dos" — ezek a
       kódból jönnek, l. logError hívások),
     - a /client-error VÉGPONTJAI (útvonal-alak, a validátor amúgy is szűkíti).
   SOHA nem kerül ki a hiba ÜZENETE, VERME vagy bármely felhasználói tartalom. Amit
   nem tudunk biztonságos címkére szűkíteni, az "egyéb"-ként, PUSZTA SZÁMKÉNT számít.
   Ezt a garanciát az errorDigest.test.js kényszeríti ki (titok-próbával).

   A BEMENET: a `journalctl -u notes -p err --since … -o json` kimenete a stdin-en
   (soronként egy JSON-objektum). A `<3>` err-prefixet a journald már lenyelte
   (l. src/log.js STDERR_PRIORITY), tehát a MESSAGE a tiszta naplósor.
   ARGV: [2]=info-sorok száma, [3]=notice-sorok száma, [4]=időszak felirata. */

"use strict";

// A címke legfeljebb ennyi karakter — a context és a "METÓDUS /út" is belefér.
const MAX_LABEL = 80;
/* Biztonságos címke-karakterek: a mi context-stringjeink (Todos.update) és a
   globális hibakezelő "METÓDUS /út" contextje (app.js) fér bele. Bármi más
   (pl. egy furcsa kérés-útból jövő karakter) → a címke "egyéb" lesz, tartalom
   nélkül. A ':' SZÁNDÉKOSAN kimarad: a context a tartalom első ": "-ig tart. */
const SAFE_LABEL = /^[A-Za-z0-9 ._/-]+$/;
const CLIENT_PREFIX = "Kliens-szerződés hiba: ";
// A /client-error végpont alakja (a validátor is erre szűkít); ami nem ilyen → "egyéb".
const ROUTE = /^\/[A-Za-z0-9/_-]*$/;
const OTHER = "egyéb";
// A mi naplósoraink időbélyeg-előtaggal indulnak (log.js): "[ISO] …".
const TIMESTAMP = /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] /;

const bump = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);

function safeLabel(raw) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_LABEL || !SAFE_LABEL.test(trimmed)) return null;
    return trimmed;
}

/* Egy naplóbejegyzés első sora, az "[ISO] " előtag nélkül — VAGY null, ha a sor
   nem a mi formátumunk (pl. systemd saját err-üzenete). A null a hívónak azt
   jelenti: ismeretlen forrás, csak SZÁMOLD, ne olvass ki belőle címkét. */
function ownContent(message) {
    const firstLine = String(message).split("\n", 1)[0];
    return TIMESTAMP.test(firstLine) ? firstLine.replace(TIMESTAMP, "") : null;
}

/**
 * A heti err-sorok aggregálása — CSAK biztonságos címkékké és számokká.
 * @param {string[]} messages journald MESSAGE-ek (egy err-bejegyzésenként egy)
 */
function summarize(messages) {
    const serverByContext = new Map();
    const clientByEndpoint = new Map();
    let serverTotal = 0, clientTotal = 0, otherTotal = 0;

    for (const message of messages) {
        const content = ownContent(message);
        if (content === null) {
            // Nem a mi formátumunk (systemd err stb.) — csak szám, tartalom nélkül.
            otherTotal++;
        } else if (content.startsWith(CLIENT_PREFIX)) {
            clientTotal++;
            const endpoint = content.slice(CLIENT_PREFIX.length).trim();
            bump(clientByEndpoint, ROUTE.test(endpoint) ? endpoint : OTHER);
        } else {
            // A mi logError-unk: "context: <describeError>". A context a tartalom
            // első ": "-ig tartó része; a többit (üzenet/verem) SZÁNDÉKOSAN eldobjuk.
            serverTotal++;
            const colon = content.indexOf(": ");
            const rawLabel = colon === -1 ? content : content.slice(0, colon);
            bump(serverByContext, safeLabel(rawLabel) ?? OTHER);
        }
    }
    return {serverTotal, clientTotal, otherTotal, serverByContext, clientByEndpoint};
}

// A csoport sorai darabszám szerint csökkenőben, "  címke: N" alakban.
function formatGroup(map) {
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([label, count]) => `  ${label}: ${count}`)
        .join("\n");
}

function formatDigest(summary, {period, infoCount, noticeCount}) {
    const {serverTotal, clientTotal, otherTotal, serverByContext, clientByEndpoint} = summary;
    const errTotal = serverTotal + clientTotal + otherTotal;
    const lines = [];
    lines.push("Notes — heti napló-összefoglaló");
    lines.push(`Időszak: ${period}`);
    lines.push("");
    lines.push(`Hibák (err) összesen: ${errTotal}`);
    lines.push("");
    lines.push(`Szerver-hibák: ${serverTotal}`);
    if (serverByContext.size) lines.push(formatGroup(serverByContext));
    lines.push("");
    lines.push(`Kliens-szerződés hibák: ${clientTotal}`);
    if (clientByEndpoint.size) lines.push(formatGroup(clientByEndpoint));
    if (otherTotal) {
        lines.push("");
        lines.push(`Egyéb (rendszer) err-sor: ${otherTotal}`);
    }
    lines.push("");
    lines.push("Napló-aktivitás (nem hiba):");
    lines.push(`  notice (5): ${noticeCount}`);
    lines.push(`  info (6): ${infoCount}`);
    lines.push("");
    lines.push("A hibák ÜZENETE és VERME szándékosan nincs ebben a levélben (a Gmailen megy át).");
    lines.push("Teljes napló a gépen:  journalctl -u notes -p err --since \"1 week ago\"");
    return lines.join("\n") + "\n";
}

/* A stdin JSON-soraiból a MESSAGE-ek. A journald `-o json`-ja soronként egy
   objektum; a MESSAGE lehet string, vagy (nem-UTF8 esetén) bájt-tömb — utóbbit
   összefűzzük (a címke-kinyerés úgyis "egyéb"-re esik, ha nem értelmes). */
function messagesFromJsonLines(text) {
    const messages = [];
    for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        let message = entry.MESSAGE;
        if (Array.isArray(message)) message = message.map((byte) => String.fromCharCode(byte)).join("");
        if (typeof message === "string") messages.push(message);
    }
    return messages;
}

if (require.main === module) {
    const input = require("fs").readFileSync(0, "utf8");
    const summary = summarize(messagesFromJsonLines(input));
    const digest = formatDigest(summary, {
        period: process.argv[4] ?? "az elmúlt hét",
        infoCount: process.argv[2] ?? "?",
        noticeCount: process.argv[3] ?? "?",
    });
    process.stdout.write(digest);
}

module.exports = {summarize, formatDigest, messagesFromJsonLines};
