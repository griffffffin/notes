/* MELYIK SZEKCIÓKAT menti a napi export — a modellekből felderítve.

   Korábban ez egy kézi lista volt a daily-export.js-ben. A baja nem az volt,
   hogy hosszú, hanem hogy a KIMARADÁS NÉMA: ha egy új szekció modellje mellé
   nem került oda a listasor, a szkript nem hibázott, csak nem tudott a
   szekcióról — az adat SOHA nem került mentésbe, és ez először egy
   visszaállításnál derült volna ki, amikor már késő.

   A megoldás nem a puszta automatizmus. A collectionöket önmagukban felderíteni
   veszélyes: a `users` táblát is megtalálná, és minden éjjel kiírná a
   jelszó-hasheket. Ezért minden modellnek NYILATKOZNIA kell magáról:

       Model.exportName = "to-dos";   // mentendő szekció, ez a fájlnév-előtagja
       Model.exportName = null;       // soha ne exportáld (l. users.js)

   A nyilatkozat nélküli modell HIBA — a felejtés így nem néma kihagyás, hanem
   hangos elszállás —, de a hiba CSAK A SAJÁT szekcióját ejti ki: a többi
   szekció mentése aznap éjjel akkor is elkészül, a szkript pedig utána lép ki
   nem-nulla kóddal. A hangos hibának nem szabad járulékos kárt okoznia.

   Mivel a szekció felvételekor a modellt amúgy is meg kell írni, a nyilatkozat
   pont ott van, ahol az ember éppen gépel. A kaput a
   scripts/exportSections.test.js tartja: a hiba nem éjjel egykor, a journalban
   jelentkezik, hanem a commitnál, pirosan. */
const fs = require("fs");
const path = require("path");

const MODELS_DIR = path.join(__dirname, "../src/models");

/* Amit egy exportált szekció modelljétől ELVÁRUNK — mindhármat maga az export
   használja, és mindhárom hiánya CSENDBEN rontana el valamit, nem hibával:
   ezért ellenőrizzük itt, a felderítéskor. */
const REQUIRED_PATHS = {
    user: "erre szűkít az EXPORT_USER_ID (enélkül idegen adat is a fájlba kerülne)",
    order: "erre rendez a sort(\"user order\") — enélkül a napi fájlok sorrendje esetleges, és nem diffelhetők",
    updatedAt: "ebből dönti el az export, volt-e aznapi módosítás — enélkül SOHA nem születne fájl"
};

/* Egy modell nyilatkozatának értelmezése: szekció-leíró objektum, vagy `null`,
   ha a modell kimondottan nem exportálandó. Külön (fs-mentes) függvény, hogy a
   teszt kitalált modellekkel is meg tudja szólítani. */
function declaredSection(file, model) {
    /* Object.hasOwn, nem `model.exportName === undefined`: a HIÁNYZÓ nyilatkozat
       és a szándékos `null` két különböző dolog, és csak az előbbi hiba. */
    if (!Object.hasOwn(model, "exportName")) {
        throw new Error(`${file}: a modell nem mondja meg, kell-e menteni. ` +
            "Írd a modell mellé: Model.exportName = \"<fájlnév-előtag>\" (mentendő szekció), " +
            "vagy Model.exportName = null (soha ne exportáld).");
    }

    const name = model.exportName;
    if (name === null) return null;
    if (typeof name !== "string" || name.trim() === "") {
        throw new Error(`${file}: az exportName vagy nem-üres szöveg (fájlnév-előtag), vagy null. ` +
            `Kaptam: ${JSON.stringify(name)}`);
    }
    /* A fájlnév-előtag a fájlrendszerbe megy: a "/" alkönyvtárat, a ".." pedig
       kilépést jelentene az EXPORT_DIR-ből — az ilyen név nem elgépelés, hanem
       csendben máshová (vagy sehová) mentés. */
    if (name !== path.basename(name)) {
        throw new Error(`${file}: az exportName fájlnév-előtag, nem útvonal — nem tartalmazhat "/"-t vagy ".."-ot. ` +
            `Kaptam: ${JSON.stringify(name)}`);
    }

    for (const [field, reason] of Object.entries(REQUIRED_PATHS)) {
        if (!model.schema.path(field)) {
            throw new Error(`${file}: exportName="${name}", de a sémából hiányzik a "${field}" mező, ` +
                `amire a napi export épül (${reason}).`);
        }
    }
    return {file, name, model};
}

/* A nyilatkozatok összegyűjtése egy [fájlnév, modell] listából: a mentendő
   szekciók ÉS a hibák, egyszerre. Nem dob — a hívó dolga, mit kezd velük.

   Miért nem dob? Mert egy nyilatkozat nélküli új modell miatt nem szabad
   elmaradnia a to-dók és az idézetek aznapi mentésének is. A hiba hangos marad
   (a szkript nem-nulla kóddal lép ki, a journalban ott a magyarázat), csak nem
   visz magával működő mentéseket.

   A felderítéstől (fs) SZÁNDÉKOSAN külön: így a teszt az összes hibaágat
   kitalált modellekkel, ideiglenes fájlok nélkül végig tudja járni. */
function sectionsFrom(entries) {
    const declared = [];
    const errors = [];

    for (const [file, model] of entries) {
        /* A validáló dobással jelez (egy hiba = egy kimondott ok, olvasható kód),
           itt viszont fel KELL fogni: a rossz modell után a többinek sorra kell
           kerülnie. */
        try {
            const section = declaredSection(file, model);
            if (section) declared.push(section);
        } catch (error) {
            errors.push(error.message);
        }
    }

    /* Két szekció azonos előtaggal ugyanabba a fájlba írna (a későbbi felülírná a
       korábbit), és a retenciójuk is összekeveredne — az egyik szekció friss
       mentése törölné a másik régijét. Ilyenkor EGYIKET SEM exportáljuk: az egyik
       adata így is, úgy is kimaradna, de legalább nem keveredik el egy olyan
       fájlban, aminek a neve mást ígér. */
    const claimants = new Map();
    for (const section of declared) {
        claimants.set(section.name, [...(claimants.get(section.name) ?? []), section.file]);
    }
    const contested = [...claimants].filter(([, files]) => files.length > 1);
    for (const [name, files] of contested) {
        errors.push(`Több modell kéri ugyanazt a fájlnév-előtagot ("${name}"): ` +
            `${files.join(", ")}. Egy előtag egy szekcióé.`);
    }
    const contestedNames = new Set(contested.map(([name]) => name));
    const sections = declared.filter((section) => !contestedNames.has(section.name));

    /* Nulla szekció nem "nincs mit menteni", hanem majdnem biztosan hiba (rossz
       mappa, elmaradt telepítés): a szkript némán, sikeresen lefutna, és soha nem
       születne mentés. Csak akkor mondjuk ki, ha más hiba nem magyarázza már. */
    if (sections.length === 0 && errors.length === 0) {
        errors.push("Egyetlen mentendő szekciót sem találtam — minden modell null-t mond magáról?");
    }
    return {sections, errors};
}

/* Modellfájl-e. A kiterjesztés MINDKÉT alakot elfogadja (.js és .ts), mert a
   TypeScript-átállás alatt a mappa hosszú ideig VEGYES lesz.

   Miért nem elég a ".js": ha a szűrő csak azt ismerné, egy már átírt quotes.ts-t
   nem találna meg — és ez a hiba a legrosszabb fajta volna. Nem üresen futna
   (arra a fenti "egyetlen szekciót sem találtam" ág figyel), hanem RÉSZLEGESEN:
   a még .js-ben lévő szekciókat lementené, hibát nem jelezne, kilépési kódja 0
   maradna. Vagyis a szolgáltatás zöld, a mentés hiányos — pontosan az a néma
   kimaradás, ami ellen ez az egész gépezet készült.

   A tesztfájlok és a típusdeklarációk (.d.ts — csak típus, futásidejű exportja
   nincs) kimaradnak. */
function isModelFile(file) {
    return /\.[jt]s$/.test(file) && !/\.test\.[jt]s$/.test(file) && !file.endsWith(".d.ts");
}

/* A modell-mappa átfésülése. A sorrend ábécé szerint rögzített, hogy a szkript
   naplója futásról futásra ugyanaz legyen (a readdir sorrendje
   fájlrendszerfüggő). */
function discoverSections(directory = MODELS_DIR) {
    const files = fs.readdirSync(directory)
        .filter(isModelFile)
        .sort();
    return sectionsFrom(files.map((file) => [file, require(path.join(directory, file))]));
}

module.exports = {discoverSections, sectionsFrom};
