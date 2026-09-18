/* A SORSZÁMOZÁS ÉPSÉGÉNEK ELLENŐRZÉSE — a MEGLÉVŐ adaton.

   Minden szekció elemei felhasználónként hézag- és ütközésmentes sorszámokat
   viselnek: 1, 2, 3, … Ezt a szabályt az `ordering.js` mondja ki, és rá épül a
   rendezés, a beszúrás, a törlés és a húzásos átrendezés is.

   MIÉRT KELL EZ A SZKRIPT. Mert a szabály korábban MEGSÉRÜLHETETT. Mérve
   (2026-08-21, izolált adatbázisban): ha egy létrehozás kérése megkettőződött —
   a kliens időtúllépés után újranyomta a mentést, miközben az első kérés a
   szerveren még futott —, akkor a fölös elem MELLETT a sorszámok is elromlottak:
   két elem ugyanazon a helyen, és hézag utána. A létrehozás azóta idempotens
   (l. src/controllers/createOnce.js), de ez a JÖVŐRE véd; ami korábban elromlott,
   az elromolva maradt.

   Ez a szkript CSAK OLVAS. Nem javít semmit: a helyreállítás emberi döntés (melyik
   a két azonos sorszámú elem közül az igazi?), és egy néma automatikus átszámozás
   pont azt a fajta beavatkozás lenne, amit ez a projekt kerül.

   Futtatás:  node --env-file=.env scripts/check-ordering.js
   Kilépési kód: 0 = minden szekció ép, 1 = van sérülés (vagy hiba). */

/* Az env-et a Node tölti a `--env-file`-lal (l. a Futtatás-sort és src/app.js
   indoklását); korábban itt `dotenv` állt. A TESZT (check-ordering.test.js) csak a
   tiszta `problemsFor`-t importálja, DB nélkül — annak nem kell env-fájl. */
const mongoose = require("mongoose");
const {discoverSections} = require("./exportSections");

/* Egy felhasználó egy szekción belüli sorszámai. A hibát KÉTFÉLEKÉPPEN nevezzük
   meg, mert a két baj súlya és a javítása is más: az ÜTKÖZÉS (két elem ugyanazon
   a helyen) a rendezést teszi kiszámíthatatlanná, a HÉZAG csak esztétikai. */
function problemsFor(orders) {
    const sorted = [...orders].sort((a, b) => a - b);
    const duplicates = [...new Set(sorted.filter((value, index) => sorted[index - 1] === value))];
    const expected = Array.from({length: sorted.length}, (unused, index) => index + 1);
    const hasGap = new Set(sorted).size !== sorted.length
        ? null // ütközés mellett a hézag kérdése értelmetlen — előbb azt kell rendezni
        : sorted.some((value, index) => value !== expected[index]);
    return {duplicates, hasGap};
}

async function main() {
    /* A szekciókat a MODELLEK mondják meg, nincs kézi lista — ugyanaz a felderítés,
       amit a napi export használ. A `errors` a nyilatkozat nélküli modelleké: azokat
       kiírjuk és a végén bukunk, de a nyilatkozó szekciókat attól még megnézzük
       (a hangos hiba ne vigye magával a működő ellenőrzést). */
    const {sections, errors} = discoverSections();
    for (const error of errors) console.error(error);
    await mongoose.connect(process.env.DATABASE);

    let broken = 0;
    for (const section of sections) {
        // Csak a két mező kell, amiből a szabály áll — a tartalom nem tartozik ránk.
        const items = await section.model.find({}, {user: 1, order: 1}).lean();
        const byUser = new Map();
        for (const item of items) {
            const key = String(item.user);
            if (!byUser.has(key)) byUser.set(key, []);
            byUser.get(key).push(item.order);
        }

        for (const [user, orders] of byUser) {
            const {duplicates, hasGap} = problemsFor(orders);
            if (duplicates.length > 0) {
                broken++;
                console.error(`${section.name}: a(z) ${user} felhasználónál ÜTKÖZŐ sorszám: ` +
                    `${duplicates.join(", ")} (${orders.length} elem)`);
            } else if (hasGap) {
                broken++;
                console.error(`${section.name}: a(z) ${user} felhasználónál HÉZAG van a sorszámokban ` +
                    `(${orders.length} elem, legnagyobb: ${Math.max(...orders)})`);
            }
        }
        console.log(`${section.name}: ${items.length} elem, ${byUser.size} felhasználó — megnézve`);
    }

    await mongoose.disconnect();
    if (errors.length > 0) {
        console.error("\nVolt nyilatkozat nélküli modell — azt a szekciót NEM néztem meg.");
        process.exit(1);
    }
    if (broken > 0) {
        console.error(`\n${broken} sérült lista. A javítás EMBERI döntés — a szkript szándékosan nem nyúl hozzá.`);
        process.exit(1);
    }
    console.log("\nMinden lista sorszámozása ép.");
}

/* A tiszta szabály KÜLÖN is kimondva — a tesztje adatbázis nélkül futtatható,
   és az `require.main` vizsgálat miatt a szkript importáláskor nem indul el. */
module.exports = {problemsFor};

if (require.main === module) main().catch(async (error) => {
    console.error("A sorszám-ellenőrzés elhasalt:", error);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
