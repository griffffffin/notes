/* GYAKORI-JELSZÓ-LISTA — a formailag megfelelő, de gyenge jelszó ellen.

   MIÉRT KELL. A regisztráció jelszó-szabálya (create.js, PASSWORD_RULE) csak a
   FORMÁT nézi: legyen ≥8 karakter, kis- és nagybetű meg szám. Ezt a szűrőt a
   leggyakoribb, feltört jelszavak jó része KÖNNYEN átugorja — a „Password1", a
   „Qwerty123", a „Trustno1" mind szabályos alakú, mégis a szótár-támadások első
   pár ezer tippje között van. A formai szabály tehát nem elég; kell egy lista a
   ténylegesen gyakori jelszavakról, és azt vissza kell utasítani.

   MIÉRT HELYI LISTA, ÉS NEM A HaveIBeenPwned API. A HIBP futásidőben, HÁLÓZATON
   át kérdezné le a jelszó lenyomatát egy harmadik féltől — épp az a
   megfigyelés-mentesség sérülne, ami a projekt egyik alapelve. Ehelyett a
   leggyakoribb ~10 000 jelszót EGYSZER, fejlesztéskor letöltöttük egy ismert
   listából (SecLists, xato-net), és a repóban tároljuk (data/common-passwords.txt).
   Futásidőben semmilyen külső hívás nincs.

   A LISTA ALAKJA — és miért pont ez. A tárolt sorok KISBETŰSEK, és csak olyan
   jelszavak, amivé egy formailag ÉRVÉNYES bemenet kisbetűsítve válhat: `[a-z0-9]`,
   ≥8 karakter, van benne betű ÉS szám. Ennek az oka a párosítás a create.js
   szabályával: a bemenetet is kisbetűsítjük, mielőtt a listában keresnénk, így a
   „Password1" és a „password1" ugyanarra a sorra esik — a nagybetűsítéssel nem
   lehet a szűrőt megkerülni. Ami a formai szabályt amúgy sem ütné meg (pl. a
   csupa kisbetűs „password"), azt kihagytuk a fájlból: a create.js már a formai
   ellenőrzésen elutasítja, tárolni fölösleges súly volna.

   NÉMA LEMONDÁS ELLEN — KAPU. Ha a lista fájl hiányzik, üres, vagy elolvashatatlan,
   a Set üres lenne, és a `isCommonPassword` MINDIG hamisat adna: a védelem némán
   eltűnne, egyetlen hibaüzenet nélkül. Ez pontosan az a fajta csendes romlás, ami
   ellen a projekt a legtöbbet teszi. Ezért a modul betöltéskor, HANGOSAN dob, ha a
   lista nem áll össze — a szerver a naplóban, a systemd újraindítás-hurkában látható
   módon bukik el, nem pedig csendben, gyenge jelszavakat átengedve. */
const fs = require("node:fs");
const path = require("node:path");

const LIST_PATH = path.join(__dirname, "data", "common-passwords.txt");

/* A lista józan alsó korlátja: ha ennél kevesebb jön össze, valami elromlott (rossz
   útvonal, csonka fájl, félresikerült szűrés) — nem az igazi ~10 000-es lista.
   Nem a pontos darabszámot rögzítjük (az a lista karbantartásakor változhat), csak
   azt, hogy nem egy majdnem üres fájllal indulunk el. */
const MIN_EXPECTED = 1000;

/* Az útvonal PARAMÉTER (alapból a valódi lista): a kapu-teszt így egy szándékosan
   csonka fájllal is meg tudja hívni, anélkül hogy a modul rögzített útvonalát
   babrálná. */
function loadCommonPasswords(listPath = LIST_PATH) {
    const raw = fs.readFileSync(listPath, "utf8");
    const passwords = new Set(
        raw.split("\n").map((line) => line.trim().toLowerCase()).filter(Boolean),
    );
    if (passwords.size < MIN_EXPECTED)
        throw new Error(
            `A gyakori-jelszó-lista (${listPath}) csak ${passwords.size} bejegyzést adott ` +
            `(elvárt legalább ${MIN_EXPECTED}). A védelem így némán kikapcsolna — a betöltés leáll.`,
        );
    return passwords;
}

const commonPasswords = loadCommonPasswords();

/* IGAZ, ha a jelszó a gyakori listán van. A bemenetet kisbetűsítjük, mert a lista
   is kisbetűs — így a nagy-/kisbetű variálásával nem lehet megkerülni. */
function isCommonPassword(password) {
    return commonPasswords.has(password.toLowerCase());
}

module.exports = {isCommonPassword, loadCommonPasswords, MIN_EXPECTED};
