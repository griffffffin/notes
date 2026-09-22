/* MENTÉS-VISSZAFEJTŐ — a titkosított napi export nyílt JSON-ná fejtése, APP/BÖNGÉSZŐ/
   SZERVER NÉLKÜL, nyers Node-dal. Ez az [[offline-restorable-backups]] kemény
   követelménye: a mentést az app elérhetetlensége (épp az a fenyegetés, ami ellen a
   mentés van) esetén is vissza lehessen olvasni. A kör-teszt (decrypt-export.test.js)
   bizonyítja, hogy ez TÉNY, nem hit (E2EE.md 7.).

   A VISSZAFEJTŐ LÁNC (l. E2EE.md 3–4.). Két titok kell: a jelszó és — ha a wrappedMk
   borsozott — a bors (E2EE_PEPPER):
     a) BORS leszedése:  a tárolt "pepper1…" wrappedMk → kliens-oldali "e2ee1…" wrappedMk
        (a MEGLÉVŐ src/e2ee/pepper.js openWithPepper-jével; nincs másolat).
     b) KEK:             Argon2id(jelszó, kdfSalt, kdf) → 32 bájt (hash-wasm — UGYANAZ a
        könyvtár, mint a frontend kliensen, tehát a KEK bájt-azonos).
     c) MK kicsomagolás: AES-256-GCM(KEK, wrappedMk), AAD NÉLKÜL → 32 bájt mesterkulcs.
     d) tartalom:        AES-256-GCM(MK, ciphertext), AAD = `${section}|${_id}` → JSON-szöveg.

   MIÉRT node:crypto AES, nem @noble. A visszafejtéshez elég a beépített kripto (a
   pepper.js is ezt használja), így a backend nem hoz be egy második AES-t. Argon2id-t
   viszont a node nem tud → hash-wasm (a frontenddel azonos). A "e2ee1"-formátum egyetlen
   különbsége a node:crypto-hoz képest: a @noble a 16 bájtos hitelesítő címkét a ciphertext
   VÉGÉRE fűzi, ezt itt le kell választani (mint a pepper.js-ben).

   ⚠ A FORMÁTUM-KONSTANSOK a frontend/src/e2ee/aead.ts-ével KÉTOLDALI KÖTÉSBEN állnak (a
   kommentre bízott kötés némán elcsúszik, CLAUDE.md 1. pont) — ezért őrzi őket a
   golden-vektor teszt: egy VALÓDI frontend-kóddal gyártott, befagyasztott minta, amit ennek
   a szkriptnek ismert nyílt szövegre kell fejtenie. Ha bármelyik oldal formátuma elcsúszik,
   az a teszt pirosra vált.

   ⚠ A JELSZÓ SOHA nem parancssori argumentumból jön (a `ps` kilistázná — least-disclosure,
   CLAUDE.md): interaktívan, elrejtett bevitellel, vagy csővezetéken a stdin-ről. */
const crypto = require("node:crypto");
const fs = require("fs");
const path = require("path");
const readline = require("node:readline");
const {argon2id} = require("hash-wasm");
const {openWithPepper} = require("../src/e2ee/pepper");

/* FORMÁTUM — a frontend aead.ts-ével egyezik (l. a fenti figyelmeztetés). A GCM IV-je 12
   bájt, a hitelesítő címke 16 bájt, a kulcs (KEK és MK is) 32 bájt. */
const CONTENT_FORMAT = "e2ee1";     // a kliens tartalom-/wrap-borítékának jelölője
const PEPPER_FORMAT = "pepper1";    // a szerver bors-borítékának jelölője (pepper.js)
const SEPARATOR = ".";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

/* AES-256-GCM VISSZAFEJTÉS, a frontend aead.ts `open`-jének megfelelője, de node:crypto-val.
   DOB, ha a formátum nem a miénk, ha az alak hibás, vagy ha a hitelesítő címke nem stimmel
   (rossz kulcs, megbuherált tárolt érték, rossz AAD). A hibát SOHA nem nyeljük el: a
   fél-eredmény (rossz kulcsú „nyers" bájtok) pont azt a garanciát törölné, amiért a GCM van. */
function openEnvelope(key, envelope, aad) {
    const parts = envelope.split(SEPARATOR);
    const [format, ivBase64, blobBase64] = parts;
    if (parts.length !== 3 || format !== CONTENT_FORMAT
        || ivBase64 === undefined || blobBase64 === undefined)
        throw new Error("A boríték nem a mi formátumunk (e2ee1).");
    const iv = Buffer.from(ivBase64, "base64");
    const blob = Buffer.from(blobBase64, "base64");
    if (iv.length !== IV_BYTES || blob.length < TAG_BYTES)
        throw new Error("A boríték hibás alakú (IV- vagy címke-hossz).");
    const ciphertext = blob.subarray(0, blob.length - TAG_BYTES);
    const tag = blob.subarray(blob.length - TAG_BYTES);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    if (aad !== undefined) decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/* AZ AAD a tartalom-borítékhoz: `${section}|${id}` — a HELYÉHEZ köti a ciphertextet, hogy a
   szerver ne cserélhessen ki két elem blobját (swap-támadás). PONTOSAN úgy kell felépíteni,
   mint a frontend content.ts `aadFor`-ja: az `id` a válaszból jövő SZÖVEG-alak (a mentésben
   az `_id` JSON-ként is szöveg), nem ObjectId — különben az AAD-bájtok eltérnének, és a
   GCM-decrypt (helyesen) dobna. */
const aadFor = (section, id) => Buffer.from(`${section}|${id}`, "utf8");

/* A KEK LEVEZETÉSE — hash-wasm Argon2id, a frontend masterKey.ts `deriveKek`-jével azonos
   paraméterekkel. A `kdf.algorithm` az egyetlen támogatott érték kell legyen; a többi
   paramétert a tárolt beiratkozásból vesszük, hogy a régi fiók a SAJÁT paramétereivel
   oldódjon fel akkor is, ha az alapérték időközben erősödött. */
async function deriveKek(password, saltBytes, kdf) {
    if (kdf.algorithm !== "argon2id")
        throw new Error(`Nem támogatott KDF-algoritmus: ${JSON.stringify(kdf.algorithm)}`);
    return argon2id({
        password,
        salt: saltBytes,
        memorySize: kdf.memorySize,
        iterations: kdf.iterations,
        parallelism: kdf.parallelism,
        hashLength: KEY_BYTES,
        outputType: "binary",
    });
}

/* AZ MK VISSZANYERÉSE a beiratkozásból + a jelszóból. A `wrappedMk` KÉT alakban jöhet, és a
   FORMÁTUM-ELŐTAG dönt (nem külön kapcsoló, mert a tárolt érték maga megmondja, mi ő):
     - "pepper1…"  a szerver TÁROLT alakja (borsozott) → leszedjük a borsot (E2EE_PEPPER kell).
     - "e2ee1…"    a kliensnek adott alak (a /me így küldi) → már borstalanított, egyből megy.
   Így a szkript a dump-ból (borsozott) ÉS a /me-ből (borstalanított) kapott beiratkozással is
   működik. Rossz jelszó → a KEK rossz → a GCM-címke bukik → DOB (ez maga a jelszó-ellenőrzés). */
async function recoverMasterKey(enrollment, password) {
    if (typeof enrollment?.wrappedMk !== "string")
        throw new Error("A beiratkozásból hiányzik a wrappedMk.");
    if (typeof enrollment.kdfSalt !== "string" || typeof enrollment.kdf !== "object" || enrollment.kdf === null)
        throw new Error("A beiratkozásból hiányzik a kdfSalt vagy a kdf.");

    /* A borsozott tárolt alakról leszedjük a borsot. A GCM-throw itt (rossz/hiányzó bors) a
       nyers node:crypto-üzenetet adná — ez helyi visszaállító eszköz, ahol a felhasználó az
       operátor, ezért érthető okot mondunk (a hibát nem nyeljük el, azonnal továbbdobjuk). */
    let wrapped;
    if (enrollment.wrappedMk.startsWith(PEPPER_FORMAT + SEPARATOR)) {
        try { wrapped = openWithPepper(enrollment.wrappedMk); }
        catch { throw new Error("A bors (E2EE_PEPPER) nem oldja fel a tárolt wrappedMk-t — hiányzó vagy rossz bors-titok?"); }
    } else {
        wrapped = enrollment.wrappedMk;
    }

    const salt = Buffer.from(enrollment.kdfSalt, "base64");
    const kek = await deriveKek(password, salt, enrollment.kdf);
    /* Rossz jelszó → a KEK rossz → a GCM-címke bukik. Érthető okot adunk (l. fent). */
    let masterKey;
    try { masterKey = openEnvelope(kek, wrapped); }
    catch { throw new Error("A mesterkulcs kicsomagolása nem sikerült — rossz jelszó, vagy sérült/rossz borsú beiratkozás?"); }
    /* Másodlagos védvonal: egy elrontott, de véletlenül átmenő boríték se adjon rossz
       hosszú kulcsot a tartalom-visszafejtésnek (mint a frontend unwrapMasterKey). */
    if (masterKey.length !== KEY_BYTES)
        throw new Error("A kicsomagolt mesterkulcs hossza hibás — rossz jelszó vagy bors?");
    return masterKey;
}

/* EGY DOKUMENTUM VISSZAFEJTÉSE. A `ciphertext` mezőt leváltjuk a visszafejtett tartalmi
   mezőkkel; a SZERKEZETI mezők (_id, user, order, updatedAt, __v) VÁLTOZATLANUL maradnak — a
   kimenet így a régi, nyílt export alakját reprodukálja. Szekció-agnosztikus: nem tudja
   előre, mely tartalmi mezők vannak (idézetnél quote/author/…, később filmnél más), csak
   a borítékból kibontott JSON-t olvassa be. */
function decryptDocument(masterKey, section, document) {
    if (typeof document?.ciphertext !== "string")
        throw new Error(`A(z) ${document?._id ?? "?"} dokumentumnak nincs ciphertext mezője.`);
    const id = String(document._id);
    const plaintext = openEnvelope(masterKey, document.ciphertext, aadFor(section, id)).toString("utf8");
    const content = JSON.parse(plaintext);
    /* A ciphertextet kihagyjuk a kimenetből (a tartalma már a `content`-ben van), a többi
       szerkezeti mezőt megtartjuk. MÁSOLATON törlünk, hogy a bemeneti dokumentumot ne írjuk át. */
    const structural = {...document};
    delete structural.ciphertext;
    return {...structural, ...content};
}

/* A TELJES MENTÉS VISSZAFEJTÉSE — a tiszta, tesztelhető mag (I/O nélkül). Egyszer nyeri
   vissza az MK-t (a drága Argon2id EGYSZER fut), majd minden dokumentumot azzal fejt. */
async function decryptExport({documents, enrollment, password, section}) {
    if (!Array.isArray(documents))
        throw new Error("A mentés-fájl tartalma nem JSON-tömb.");
    const masterKey = await recoverMasterKey(enrollment, password);
    return documents.map((document) => decryptDocument(masterKey, section, document));
}

/* A SZEKCIÓ kitalálása a mentés-fájl nevéből: a napi export "<szekció>-ÉÉÉÉ-HH-NN.json"
   alakú (daily-export.js), tehát a dátum-utótag levágásával megvan a szekció (a "to-dos"
   belső kötőjele nem zavar, mert a dátumra illesztünk). Kézzel felül lehet írni a
   --section kapcsolóval — a szekció az AAD része, tehát a rossz érték HANGOSAN elhasal. */
function deriveSection(filename) {
    const match = /^(.+)-\d{4}-\d{2}-\d{2}\.json$/.exec(filename);
    if (!match)
        throw new Error(`A "${filename}" névből nem tudom kitalálni a szekciót — add meg a --section kapcsolóval.`);
    return match[1];
}

/* A JELSZÓ BEOLVASÁSA — SOHA argv-ból. TTY-n elrejtett bevitel; csővezetéken (nem-TTY) az
   egész stdin a jelszó. A magot (decryptExport) ez nem érinti: a teszt közvetlenül a
   jelszó-sztringgel hívja, ezt a CLI-utat kézzel próbáljuk. */
function readPassword(label = "Jelszó: ") {
    return new Promise((resolve, reject) => {
        if (!process.stdin.isTTY) {
            let data = "";
            process.stdin.setEncoding("utf8");
            process.stdin.on("data", (chunk) => { data += chunk; });
            process.stdin.on("end", () => resolve(data.replace(/\r?\n$/, "")));
            process.stdin.on("error", reject);
            return;
        }
        const rl = readline.createInterface({input: process.stdin, output: process.stdout, terminal: true});
        let muted = false;
        // A beírt karaktereket nem visszhangozzuk; a "Jelszó: " címke még muted ELŐTT megy ki.
        rl._writeToOutput = (text) => { if (!muted) process.stdout.write(text); };
        rl.question(label, (answer) => {
            rl.close();
            process.stdout.write("\n");
            resolve(answer);
        });
        muted = true;
    });
}

// A parancssori kapcsolók minimális feldolgozása (egy pozicionális: a mentés-fájl).
function parseArgs(argv) {
    const options = {backupPath: undefined, enrollmentPath: undefined, section: undefined, outPath: undefined};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--enrollment") { options.enrollmentPath = argv[++index]; }
        else if (arg === "--section") { options.section = argv[++index]; }
        else if (arg === "--out") { options.outPath = argv[++index]; }
        else if (!arg.startsWith("--") && options.backupPath === undefined) { options.backupPath = arg; }
        else throw new Error(`Ismeretlen vagy fölös argumentum: ${arg}`);
    }
    if (options.backupPath === undefined)
        throw new Error("Add meg a mentés-fájlt. Használat: "
            + "node --env-file=.env scripts/decrypt-export.js <mentés.json> --enrollment <beiratkozás.json> [--section quotes] [--out nyilt.json]");
    if (options.enrollmentPath === undefined)
        throw new Error("Add meg a beiratkozás-fájlt a --enrollment kapcsolóval "
            + "(tartalma: {\"wrappedMk\":\"…\",\"kdfSalt\":\"…\",\"kdf\":{…}}).");
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const documents = JSON.parse(fs.readFileSync(options.backupPath, "utf8"));
    const enrollment = JSON.parse(fs.readFileSync(options.enrollmentPath, "utf8"));
    const section = options.section ?? deriveSection(path.basename(options.backupPath));

    const password = await readPassword();
    const plain = await decryptExport({documents, enrollment, password, section});
    const json = JSON.stringify(plain, null, 2) + "\n";

    if (options.outPath) {
        /* 0600: a kimenet a felhasználó NYÍLT adata — másnak semmit. (A napi export a
           setgid-es mentés-könyvtár miatt 0640; ez viszont ad-hoc, kézi kimenet.) */
        fs.writeFileSync(options.outPath, json, {mode: 0o600});
        fs.chmodSync(options.outPath, 0o600);
        console.error(`${plain.length} dokumentum visszafejtve: ${options.outPath}`);
    } else {
        process.stdout.write(json);
    }
}

if (require.main === module) {
    main().catch((error) => {
        // A részlet a naplóba (stderr), a kilépési kód jelez — néma fél-siker nincs.
        console.error("Visszafejtés hiba:", error.message);
        process.exit(1);
    });
}

module.exports = {
    decryptExport,
    recoverMasterKey,
    decryptDocument,
    openEnvelope,
    aadFor,
    deriveKek,
    deriveSection,
    parseArgs,
};
