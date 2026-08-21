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

   TITKOSÍTVA NINCS: a localStorage-hoz a gép minden, ezen a böngésző-profilon
   dolgozó használója hozzáfér. A tartalom ugyanaz a szöveg, amit a felhasználó
   épp beírt, tehát nem "új" titok — de közös gépen ez különbség. Ezért van
   LEJÁRAT: egy hetet meghaladó piszkozatot nem ajánlunk fel, és el is dobjuk.

   AMIT KIFELÉ ÍRUNK, AZ KÍVÜLRŐL JÖN VISSZA. A localStorage tartalmát a
   felhasználó (vagy egy kiegészítő) átírhatja, és egy régi appverzió is hagyhatott
   benne mást — ezért az olvasás SÉMÁVAL megy, nem hittel (l. CLAUDE.md). Hibás
   vagy elavult alak esetén nincs piszkozat, és a bejegyzést töröljük. */

import * as v from "valibot";
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

export function saveDraft(key: string, payload: unknown, base?: unknown, itemId?: string): void {
    try {
        localStorage.setItem(key, JSON.stringify({savedAt: Date.now(), payload, base, itemId}));
    } catch (error) {
        /* A localStorage írása DOBHAT: tele a kvóta, privát ablak, letiltott
           tárolás. Ez a mentés végső vésztartaléka — ha ő sem megy, akkor sincs
           mit tenni, de a felhasználó munkamenetét nem boríthatjuk fel miatta. */
        logDev("A piszkozat mentése nem sikerült:", error);
    }
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
    let raw: string | null = null;
    try {
        raw = localStorage.getItem(key);
    } catch (error) {
        logDev("A piszkozat olvasása nem sikerült:", error);
        return null;
    }
    if (raw === null) return null;

    let envelope;
    try {
        envelope = v.parse(envelopeSchema, JSON.parse(raw));
    } catch {
        // Nem JSON, vagy nem a mi alakunk (régi verzió, kézzel átírt érték).
        clearDraft(key);
        return null;
    }

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
