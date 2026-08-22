/* A PISZKOZAT-TITKOSÍTÁS KULCSA — felhasználónként egy, a fiók mellett tárolva.

   MIT VÉD. A szerkesztő mentetlen munkája a böngésző localStorage-ába kerül
   (frontend/src/drafts.ts), az pedig a felhasználó gépén, NYÍLT szövegként fekvő
   fájl. Aki hozzáfér a lemezhez — másik OS-fiók ugyanazon a gépen, vagy egy
   ellopott, kikapcsolt gép háttértára —, az elolvashatja. A kulcs ezt zárja le:
   a lemezre innentől csak titkos szöveg kerül, a kulcs pedig SEHOL nem íródik le
   a kliensen, csak a memóriában él (frontend/src/draftCrypto.ts).

   MIÉRT A SZERVEREN ÉL A KULCS, ÉS MIT NEM VÉD EZ. Innen látszik a határa is: a
   szerver ismeri a kulcsot, tehát ez NEM zero-knowledge titkosítás — a szerver
   (és aki a szervert birtokolja) elvben visszafejtené a piszkozatot. Nem is ez a
   fenyegetés, amit kezelünk: a szerveren úgyis ott van maga a MENTETT tartalom,
   a piszkozat pedig épp azt tartalmazza, ami oda igyekszik. A védendő különbség
   a KLIENS lemeze, ahol eddig titkosítatlanul feküdt olyasmi, amiről a
   felhasználó nem is tudta, hogy ott van.

   MIÉRT A FIÓK MELLETT, ÉS NEM JELSZÓBÓL SZÁRMAZTATVA. Jelszóból származtatott
   kulcshoz a nyílt jelszót kellene a memóriában tartani a munkamenet alatt (a
   szerkesztő bármikor menthet), vagy jelszóváltáskor minden piszkozat
   olvashatatlanná válna. A tárolt, véletlen kulcs ezt a két bajt kerüli ki; a
   jelszó-alapú változat majd az E2EE-vel jön, ha jön.

   MIÉRT VÉLETLEN 32 BÁJT. Ennyi az AES-256 kulcsa; a `randomBytes` a rendszer
   kriptográfiai véletlenforrása (Linuxon a getrandom(2)), nem a `Math.random`.
   base64-ben tároljuk, mert a Mongoose-séma szöveget kezel, és a hálózaton is
   szövegként megy — a kliens ott fejti vissza bájtokká.

   LUSTÁN SZÜLETIK, NEM A REGISZTRÁCIÓKOR. Így a MÁR LÉTEZŐ fiókok is kapnak
   kulcsot (a regisztráció-kori generálás csak az újakat érintené, a régiek
   piszkozata pedig örökre titkosítatlan maradna), és nem kell külön migrációs
   szkript. Ára egyetlen extra írás az első kérésnél, fiókonként egyszer. */
const {randomBytes} = require("node:crypto");
const Users = require("./models/users");

// AES-256 kulcshossz. A frontend oldali párja (draftCrypto.ts) ezt a HOSSZT
// ellenőrzi visszafejtés előtt — a kettő egyezését a frontendContract.test.js őrzi.
const KEY_BYTES = 32;

/* A KULCS KIOLVASÁSA, ÉS HA MÉG NINCS, LÉTREHOZÁSA — EGY ATOMI LÉPÉSBEN.

   MIÉRT NEM "olvasd ki, és ha nincs, írd be". Mert a kettő között más is írhat.
   A kliens a bejelentkezés után kéri a kulcsot; ha két lap (vagy egy újratöltés
   és egy háttérlap) egyszerre indul, mindkét kérés kulcsot NEM talál, mindkettő
   generál egyet, és a második FELÜLÍRJA az elsőt. Aki közben az elsővel
   titkosított piszkozatot írt a lemezre, annak a munkája örökre olvashatatlan
   lesz — némán, mert semmi nem hibázik.

   Ezért a feltétel MAGÁBAN A KÉRÉSBEN van: "azt a felhasználót módosítsd, akinek
   MÉG NINCS kulcsa". Egyetlen dokumentum egyetlen módosítása oszthatatlan, tehát
   párhuzamos kérésekből pontosan EGY illeszkedik — a többinek a szűrő már nem
   felel meg, és `null`-t kapnak vissza. Az a `null` tehát nem hiba, hanem a
   verseny elvesztése: ilyenkor a MÁSIK kérés által beírt kulcsot olvassuk ki.
   (A `{draftKey: null}` szűrő a hiányzó mezőre IS illeszkedik — ez MongoDB-
   szemantika, és élesben, FerretDB-n is lemérve, l. draftKey.test.js.)

   AMI VÉD, AZ A SZŰRŐ — NEM A LÉPÉSEK SORRENDJE. Mutáció-próbával mérve: ha a
   kód ELŐBB is olvasna (`findById`, és csak kulcs híján írna), a párhuzamossági
   teszt akkor is zöld marad, mert a versenyt továbbra is a szűrő dönti el — a
   vesztesek `null`-t kapnak, és a másik kulcsát olvassák ki. Az az alak tehát
   nem hibás, csak egy fölösleges olvasással jár. A `{draftKey: null}` feltétel
   ELHAGYÁSA viszont azonnal buktatja a tesztet: az generálna új kulcsot a régi
   helyére.

   A `_id` a TOKENBŐL jön (request.userId), nem a kérés törzséből — különben
   bárki bárkinek a kulcsát lekérhetné, és a piszkozat-titkosítás semmit sem
   érne.

   VETÍTÉST (projection) SZÁNDÉKOSAN NEM KÉRÜNK. A teljes dokumentum a szerver
   memóriájában marad, kifelé csak a kulcs megy (a controller whitelistje) — egy
   elgépelt vagy verzióváltáskor megszűnő opció-név viszont némán hatástalan
   lenne, és a "megvéd valamitől" hamis érzését hagyná itt. */
async function getOrCreateDraftKey(userId) {
    const created = await Users.findOneAndUpdate(
        {_id: userId, draftKey: null},
        {$set: {draftKey: randomBytes(KEY_BYTES).toString("base64")}},
        {new: true},
    );
    if (created?.draftKey) return created.draftKey;

    /* Ide kétféleképpen jutunk: vagy volt már kulcs (a szűrő nem illeszkedett),
       vagy egy párhuzamos kérés előbb ért ide. Mindkét esetben ugyanaz a teendő:
       olvasd ki, ami MOST van a fiókon. */
    const user = await Users.findById(userId);
    if (!user?.draftKey) {
        /* A fiók létezését az auth middleware már ellenőrizte, tehát ide csak
           akkor jutunk, ha a fiók a két lekérdezés között tűnt el, vagy az írás
           némán nem történt meg. Egyik sem várt eset — a kliens 500-at kap, és
           kulcs híján NEM ír piszkozatot (soha nem esünk vissza nyílt szövegre). */
        throw new Error(`A(z) ${userId} felhasználónak nincs piszkozat-kulcsa, és nem sikerült létrehozni.`);
    }
    return user.draftKey;
}

module.exports = {getOrCreateDraftKey, KEY_BYTES};
