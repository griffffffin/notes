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

   A nyilatkozat nélküli modelltől ez a felderítő HIBÁT DOB. A felejtés így nem
   néma kihagyás, hanem hangos elszállás — és mivel a szekció felvételekor a
   modellt amúgy is meg kell írni, a nyilatkozat pont ott van, ahol az ember
   éppen gépel. A kaput a scripts/exportSections.test.js tartja: a hiba nem
   éjjel egykor, a journalban jelentkezik, hanem a commitnál, pirosan. */
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
            "vagy Model.exportName = null (soha ne exportáld, pl. users).");
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

/* A nyilatkozatok összegyűjtése egy [fájlnév, modell] listából. A felderítéstől
   (fs) SZÁNDÉKOSAN külön: így a teszt az összes hibaágat kitalált modellekkel,
   ideiglenes fájlok nélkül végig tudja járni. */
function sectionsFrom(entries) {
    const sections = [];
    for (const [file, model] of entries) {
        const section = declaredSection(file, model);
        if (section) sections.push(section);
    }

    /* Két szekció azonos előtaggal ugyanabba a fájlba írna (a későbbi felülírná a
       korábbit), és a retenciójuk is összekeveredne — az egyik szekció friss
       mentése törölné a másik régijét. */
    for (const section of sections) {
        const twin = sections.find((other) => other !== section && other.name === section.name);
        if (twin) {
            throw new Error(`Két modell ugyanazt a fájlnév-előtagot kéri ("${section.name}"): ` +
                `${section.file} és ${twin.file}. Egy előtag egy szekcióé.`);
        }
    }

    /* Nulla szekció nem "nincs mit menteni", hanem majdnem biztosan hiba (rossz
       mappa, elmaradt telepítés): a szkript némán, sikeresen lefutna, és soha
       nem születne mentés. */
    if (sections.length === 0) {
        throw new Error("Egyetlen mentendő szekciót sem találtam — minden modell null-t mond magáról?");
    }
    return sections;
}

/* A modell-mappa átfésülése. A tesztfájlok kimaradnak, a sorrend pedig ábécé
   szerint rögzített, hogy a szkript naplója futásról futásra ugyanaz legyen (a
   readdir sorrendje fájlrendszerfüggő). */
function discoverSections(directory = MODELS_DIR) {
    const files = fs.readdirSync(directory)
        .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"))
        .sort();
    return sectionsFrom(files.map((file) => [file, require(path.join(directory, file))]));
}

module.exports = {discoverSections, sectionsFrom};
