/* PISZKOZAT: a mentetlen szerkesztői munka HELYI másolata.

   MI A BAJ, AMIT MEGOLD. A szerkesztő háromféleképpen ment, és kettő közülük a
   felhasználó háta mögött: az autosave (tétlenségkor) és a LEVÁLÁSKORI mentés
   (kijelentkezéskor, amikor a szerkesztő eltűnik a képernyőről). Ha ez utóbbi
   elbukik — lejárt token, megszakadt hálózat, alvó szerver —, akkor a beírt
   szöveg NYOMTALANUL elvész: a komponens már nincs meg, nincs kinek szólni, és
   nincs hova visszatenni. Ez a legrosszabb fajta néma hiba: nem üzenet hiányzik,
   hanem ADAT.

   Üzenettel nem is lehet orvosolni (a képernyő épp megszűnik) — csak MÁSOLATTAL.
   A sikertelen mentés tartalma ezért a böngésző localStorage-ába kerül, és a
   szerkesztő legközelebbi megnyitásakor felajánljuk visszatöltésre.

   MIÉRT localStorage, ÉS MIT JELENT EZ. A localStorage a böngésző tartós, kulcs
   → szöveg tárolója (a sütikkel szemben nem megy el minden kéréssel, és nagyobb).
   Eszközönként külön: a telefonon írt piszkozat a laptopon nem jelenik meg. Ez
   itt tudatos — a piszkozat MENTÉSI VÉSZTARTALÉK, nem szinkronizált vázlat; a
   szerverre juttatás továbbra is a mentés dolga.

   TITKOSÍTVA VAN (2026-08-21 óta). A localStorage-hoz hozzáfér a gép minden más
   OS-fiókja, és egy ellopott, KIKAPCSOLT gép lemezéről is kiolvasható — a
   tartalom pedig ugyanaz a szöveg, amit a felhasználó épp beírt, csak épp ő nem
   tud róla, hogy ott van. Ezért a lemezre CSAK titkos szöveg kerül; a kulcs a
   szervertől jön és kizárólag a memóriában él (draftCrypto.ts).

   EBBŐL EGY SZABÁLY KÖVETKEZIK, ÉS AZ KIVÉTEL NÉLKÜLI: ha nincs kulcs, akkor
   NINCS piszkozat. Nyílt szöveget "vészmegoldásként" soha nem írunk ki — a
   felhasználó kimondott elve szerint a biztonság fontosabb, mint a piszkozat.

   ÉS AMI EBBŐL A FELÜLETEN KÖVETKEZIK: kulcs nélkül a szerkesztő MEG SEM NYÍLIK
   (draftKeySession.ts, useDraftKeyGate). Így nem keletkezhet olyan mentetlen
   szöveg, amit nem tudnánk megvédeni — a "van szövegem, de nincs másolata"
   állapot nem figyelmeztetést kap, hanem nem jön létre.

   A LEJÁRAT ettől függetlenül megmarad (egy hét, l. lentebb), de már nem ez a
   védelem: a törölt localStorage-bejegyzés a lemezen amúgy sem tűnik el azonnal
   (LevelDB, l. draftCrypto.ts), tehát az órától biztonságot várni önámítás volna.

   AMIT KIFELÉ ÍRUNK, AZ KÍVÜLRŐL JÖN VISSZA. A localStorage tartalmát a
   felhasználó (vagy egy kiegészítő) átírhatja, és egy régi appverzió is hagyhatott
   benne mást — ezért az olvasás SÉMÁVAL megy, nem hittel (l. CLAUDE.md). Hibás
   vagy elavult alak esetén nincs piszkozat, és a bejegyzést töröljük. */

import * as v from "valibot";
import {decryptDraft, encryptDraft, hasDraftKey, isEncryptedDraft} from "./draftCrypto";
import {logDev} from "./log";

const PREFIX = "notes-draft:";

/* EGY HÉT (a user döntése, 2026-08-20; korábban egy hónap volt).

   A piszkozat egy elmaradt mentés pótlása, nem archívum: ami egy hétnél régebbi,
   arról a felhasználó jó eséllyel már el is felejtette, hogy létezik — a
   visszatöltése inkább lenne meglepetés, mint segítség.

   ÉS EGY HÉT AZ, AMIT A BÖNGÉSZŐK IS GARANTÁLNAK. A Safari (macOS és iOS) hét nap
   böngészés-használat után TÖRLI egy olyan oldal script-ből írt tárolóját
   (localStorage is), amivel a felhasználó közben nem lépett kapcsolatba. Ennél
   hosszabb lejáratot tehát nem mi tartunk be, hanem a böngésző mond felül —
   csendben. A rövidebb korlát ezzel őszintén együtt jár. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/* A KULCS a szerkesztett ELEMET azonosítja, nem a szerkesztőt: create-nél a
   szekció "create" piszkozata (egy van belőle), update-nél az elem azonosítója.
   Így két különböző idézet piszkozata nem üti egymást, és a create-piszkozat sem
   írja felül egy meglévő elem szerkesztését. */
export function draftKey(section: string, id: string | null): string {
    return PREFIX + section + ":" + (id ?? "create");
}

/* A BUROK sémája: mikor mentettük, mi volt benne, és MIHEZ KÉPEST.

   A `payload` a szerkesztőben álló (mentetlen) tartalom. A `base` az, amit a
   szerver adott, amikor a szerkesztő betöltött — ez teszi eldönthetővé, hogy a
   piszkozat magától visszatölthető-e: ha a szerveren azóta SEMMI nem változott
   (a friss betöltés megegyezik a base-szel), akkor a piszkozat az egyetlen újabb
   állapot, tehát nyugodtan visszaáll. Ha viszont eltér, valaki (egy másik eszköz)
   közben módosította — ott már emberi döntés kell.

   A `base` OPCIONÁLIS: create-nél nincs mihez képest (még nem létezett az elem),
   és a régebbi verziók piszkozataiban sincs benne. Mindkét eset azt jelenti, hogy
   nincs ütközés-vizsgálat — create-nél nincs is mit felülírni. */
/* Az `itemId` az ÚJ ELEM azonosítója (create-nél), amit a kliens gyárt még a
   mentés előtt (objectId.ts). Azért kell a piszkozatba, mert a létrehozás
   idempotenciája EZEN az azonosítón áll: ha az F5 vagy a lap újranyitása után új
   azonosító születne, akkor a visszatöltött piszkozat mentése ÚJ elemként menne
   át — és épp abban a helyzetben duplikálna, amiért a védelem készült. Update-nél
   nincs rá szükség (az elemnek már van azonosítója), ezért opcionális. */
const envelopeSchema = v.object({
    savedAt: v.number(),
    payload: v.unknown(),
    base: v.optional(v.unknown()),
    itemId: v.optional(v.string()),
});

type Envelope = {savedAt: number; payload: unknown; base: unknown; itemId: string | undefined};

/* A BUROK KIÍRÁSA — TITKOSÍTVA, vagy sehogy.

   A `hasDraftKey` vizsgálata nem óvatoskodás: kulcs nélkül az `encryptDraft`
   úgyis dobna, és a dobást a lenti `catch` elnyelné — vagyis pontosan ugyanaz
   TÖRTÉNNE, csak nem lehetne megkülönböztetni a "nincs kulcs" esetet a "tele a
   tároló" esettől. Kimondva viszont a naplóban is látszik, MIÉRT nincs piszkozat.

   Élesben ide ELVBEN nem is jutunk: kulcs nélkül a szerkesztő meg sem nyílik
   (draftKeySession.ts). Az ág mégsem fölösleges — ez a modul nem támaszkodhat
   arra, hogy minden hívója átment egy kapun; a helyes viselkedést itt is ki kell
   mondani, különben egy jövőbeli (kapu nélküli) hívó némán nyílt szöveget írna. */
function writeEnvelope(key: string, envelope: Envelope): void {
    if (!hasDraftKey()) {
        logDev("Nincs piszkozat-kulcs: a piszkozat NEM íródik ki (nyílt szöveget nem írunk).");
        return;
    }
    try {
        localStorage.setItem(key, encryptDraft(JSON.stringify(envelope)));
    } catch (error) {
        /* A localStorage írása DOBHAT: tele a kvóta, privát ablak, letiltott
           tárolás. Ez a mentés végső vésztartaléka — ha ő sem megy, akkor sincs
           mit tenni, de a felhasználó munkamenetét nem boríthatjuk fel miatta. */
        logDev("A piszkozat mentése nem sikerült:", error);
    }
}

export function saveDraft(key: string, payload: unknown, base?: unknown, itemId?: string): void {
    writeEnvelope(key, {savedAt: Date.now(), payload, base, itemId});
}

/* A TÁROLT ÉRTÉK BEOLVASÁSA a burok sémájáig — visszafejtéssel együtt.

   HÁROMFÉLE ÉRTÉKKEL TALÁLKOZHATUNK, és mind más bánásmódot kíván:

     1. TITKOSÍTOTT (a mai alak) — visszafejtjük;
     2. RÉGI, NYÍLT SZÖVEGŰ (a titkosítás bevezetése előttről) — elolvassuk, mert
        a felhasználó mentetlen munkája van benne, és a `readDraft` rögtön újra is
        írja titkosítva. Eldobni nem szabad: az adatvesztés volna, ráadásul a
        biztonságon sem segítene (a törölt bejegyzés a lemezen úgyis megmarad egy
        ideig, l. draftCrypto.ts);
     3. ÉRTELMEZHETETLEN (kézzel átírt, elavult séma, más kulccsal titkosított) —
        nincs piszkozat.

   A `cleanup` azért paraméter, mert a két hívó másban hisz: a `readDraft` ismeri
   a tartalom sémáját, tehát takaríthat; a `readDraftItemId` NEM ismeri, ezért
   SOHA nem töröl (l. a saját kommentjét).

   KULCS NÉLKÜL A TITKOSÍTOTT PISZKOZATHOZ NEM NYÚLUNK, és főleg NEM TÖRÖLJÜK.
   Ilyenkor a kulcs még nem érkezett meg (vagy egyáltalán nem szerezhető meg) — a
   bejegyzés viszont tökéletesen ép, és egy későbbi betöltéskor visszaadható. Aki
   itt takarítana, az a mentetlen munkát dobná ki azért, mert épp nem tudja
   elolvasni. */
function readEnvelope(key: string, cleanup: boolean):
    {envelope: v.InferOutput<typeof envelopeSchema>; encrypted: boolean} | null {
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(key);
    } catch (error) {
        logDev("A piszkozat olvasása nem sikerült:", error);
        return null;
    }
    if (raw === null) return null;

    const encrypted = isEncryptedDraft(raw);
    if (encrypted && !hasDraftKey()) return null;

    let json = raw;
    if (encrypted) {
        try {
            json = decryptDraft(raw);
        } catch (error) {
            /* A visszafejtés bukása MINDIG jelent valamit: megpiszkálták az
               értéket, vagy egy másik fiók kulcsával készült. Egyik esetben sem a
               mi adatunk — a hibát viszont soha nem nyeljük el csendben. */
            logDev("A piszkozat visszafejtése nem sikerült:", error);
            if (cleanup) clearDraft(key);
            return null;
        }
    }

    try {
        return {envelope: v.parse(envelopeSchema, JSON.parse(json)), encrypted};
    } catch {
        // Nem JSON, vagy nem a mi alakunk (régi verzió, kézzel átírt érték).
        if (cleanup) clearDraft(key);
        return null;
    }
}

/* CSAK AZ AZONOSÍTÓ a burokból — a tartalom megnézése nélkül.

   A létrehozás belépője (components/routes.tsx) ezt kérdezi: van-e félbehagyott
   create, és ha igen, milyen azonosítóval? A `readDraft` erre alkalmatlan volna,
   és nem apró okból: az a PAYLOADOT is ellenőrzi a kapott sémával, és ha nem
   illik rá, ELDOBJA a bejegyzést. A belépő viszont nem ismeri (és nem is akarja
   ismerni) az adott szekció mezőit — egy közelítő sémával a felhasználó mentetlen
   szövegét törölné ki, csendben.

   Ezért ez a függvény csak a burkot nézi, és NEM töröl semmit: a takarítás a
   szerkesztő `readDraft`-jának dolga, ami a tartalmat úgyis beolvassa. A lejárt
   bejegyzés azonosítóját viszont nem adja vissza — abból már nem folytatunk. */
export function readDraftItemId(key: string): string | null {
    const stored = readEnvelope(key, false);
    if (stored === null) return null;
    if (Date.now() - stored.envelope.savedAt > MAX_AGE_MS) return null;
    return stored.envelope.itemId ?? null;
}

export function clearDraft(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch (error) {
        logDev("A piszkozat törlése nem sikerült:", error);
    }
}

/* A piszkozat kiolvasása — ELLENŐRZÖTTEN. Nincs találat, hibás alak, elavult
   séma vagy egy hetesnél régebbi bejegyzés esetén `null`, és a szemetet takarítjuk.

   A `schema` a hívóé: ő tudja, milyen mezőket vár vissza. A generikus paraméter
   itt nem üres ígéret — a `TSchema` az ÁTADOTT séma típusa, tehát a visszatérés
   pontosan az, amit a futásidejű vizsgálat előállít (l. contractFault.ts). */
export function readDraft<TSchema extends v.GenericSchema>(
    key: string,
    schema: TSchema,
): {payload: v.InferOutput<TSchema>; base: v.InferOutput<TSchema> | null; savedAt: Date;
    itemId: string | null} | null {
    const stored = readEnvelope(key, true);
    if (stored === null) return null;
    const {envelope} = stored;

    if (Date.now() - envelope.savedAt > MAX_AGE_MS) {
        clearDraft(key);
        return null;
    }

    const parsed = v.safeParse(schema, envelope.payload);
    if (!parsed.success) {
        /* A tartalom nem illik a MAI alakhoz — például mert egy szekció mezői
           azóta megváltoztak. Felajánlani félrevezető lenne (hiányos űrlapot
           töltene vissza), ezért eldobjuk. */
        clearDraft(key);
        return null;
    }

    /* ÁTÁLLÁS A TITKOSÍTOTT ALAKRA. Ha a bejegyzés még a régi, nyílt szövegű
       formában feküdt a lemezen, itt írjuk újra titkosítva — pont most, amikor a
       tartalmát amúgy is a kezünkben tartjuk. Az `savedAt` a RÉGI marad (a
       lejárat nem indulhat újra egy formátumváltástól). Kulcs híján a
       `writeEnvelope` nem ír semmit, és a régi bejegyzés is a helyén marad: a
       felhasználó munkája megvan, csak a védelme hiányzik — ez az egyetlen hely,
       ahol a kettő közül a munkát választjuk, mert itt a nyílt szöveg MÁR ott van,
       nem mi írnánk oda. */
    if (!stored.encrypted) writeEnvelope(key, {...envelope, base: envelope.base ?? undefined,
        itemId: envelope.itemId});

    /* A `base` ugyanazon a sémán megy át, mint a tartalom — de a HIÁNYA nem hiba:
       a create-piszkozatnak és a régi bejegyzéseknek nincs. Ilyenkor `null`, és a
       hívó ütközés-vizsgálat nélkül dönt. */
    const base = v.safeParse(schema, envelope.base);
    return {
        payload: parsed.output,
        base: base.success ? base.output : null,
        savedAt: new Date(envelope.savedAt),
        itemId: envelope.itemId ?? null,
    };
}
