const {isText, isInteger, isValidOrder} = require("./validators");

/* A kérés törzsének ellenőrzése, MIELŐTT bármi az adatbázisig jutna.

   A to-do SAJÁT SZABÁLYAI (mezők, hosszkorlátok, színpaletta, listaelemek)
   SZÁNDÉKOSAN itt élnek, nem az idézetekkel közösen: a két szekció validációja
   egymástól függetlenül változhasson. Ami minden szekcióban azonos — a
   típus-ellenőrzők, a sorszám felső korlátja, az id- és a sorszám-middleware —,
   az a közös validators.js-ből jön.

   Miért kell, ha a Mongoose-sémán is van required/type? Két okból:
   (1) a findByIdAndUpdate alapból NEM futtat sémavalidátort, tehát a módosítás
       eddig bármit beírhatott (üres cím, kitalált szín);
   (2) a séma a TÍPUST nézi, a tartalmat nem — hosszkorlát, szín-paletta és
       sorszám-tartomány nélkül egy saját kliens tetszőleges méretű és értékű
       adatot tölthetett volna be.

   A típus-szigor egyben NoSQL-injekció ellen is véd: ha egy string helyére
   valaki {"$ne": null}-t küld, azt a Mongoose lekérdezés-OPERÁTORKÉNT olvasná,
   nem értékként — itt elutasítjuk, így operátor sosem jut le a szűrőbe.

   A hosszkorlátok CSAK a bejövő kérést utasítják el; a tárolt adatot nem
   csonkítják és a séma sem rögzíti őket. Emelni tehát bármikor lehet: a
   konstans átírása visszamenőleg is ártalmatlan. */

const COLORS = ["primary", "info", "secondary", "danger", "warning", "success"];
// A listaelem engedélyezett mezői — a frontend pontosan ezt a hármat küldi.
const TASK_FIELDS = ["id", "content", "done"];
const MAX_TITLE = 200;
const MAX_CATEGORY = 100;
const MAX_TASK_TEXT = 1000;
const MAX_TASK_COUNT = 3000;
/* A listaelem AZONOSÍTÓJÁNAK alakja: kanonikus nemnegatív egész, legfeljebb 7
   számjegy. Ez az alak három helyre igaz egyszerre: a `tasks` objektum KULCSA, a
   listaelem `id` mezője (a frontend key.toString()-gel állítja elő), és a
   `taskOrder` egészei erre hivatkoznak (moreTask.tsx a kulcsot max+1-gyel képzi).
   A 7 számjegy bőséges józansági/DoS-határ (az egyidejű elemek valódi korlátja a
   MAX_TASK_COUNT); nélküle egy saját kliens tetszőleges hosszú/alakú kulcsot
   küldhetne, ami tárolódik és az exportba/mentésbe is átfolyik. A kanonikus alak
   (nincs vezető nulla, nincs előjel) egyben azt is garantálja, hogy a kulcs és a
   rá `String(id)`-vel hivatkozó taskOrder-egész ugyanaz a szöveg legyen. */
const TASK_ID = /^(0|[1-9]\d{0,6})$/;

function todoErrors(body) {
    const errors = [];

    if (!isText(body.title) || !body.title.trim()) errors.push("A cím megadása kötelező.");
    else if (body.title.length > MAX_TITLE) errors.push(`A cím legfeljebb ${MAX_TITLE} karakter lehet.`);

    if (!isText(body.category) || !body.category.trim()) errors.push("A kategória megadása kötelező.");
    else if (body.category.length > MAX_CATEGORY)
        errors.push(`A kategória legfeljebb ${MAX_CATEGORY} karakter lehet.`);

    if (!COLORS.includes(body.color)) errors.push("Ismeretlen szín.");

    if (!isValidOrder(body.order)) errors.push("Érvénytelen sorszám.");

    // A tasks elhagyható (üres to-do), de ha van, valódi objektum legyen —
    // tömb és null nem: azokon a lenti bejárás csendben rosszat csinálna.
    const tasks = body.tasks;
    if (tasks !== undefined && tasks !== null) {
        if (typeof tasks !== "object" || Array.isArray(tasks)) errors.push("A listaelemek formátuma hibás.");
        else {
            const keys = Object.keys(tasks);
            if (keys.length > MAX_TASK_COUNT) errors.push(`Legfeljebb ${MAX_TASK_COUNT} listaelem lehet.`);
            for (const key of keys) {
                // A kulcs alakja (l. TASK_ID) — enélkül "-5" vagy egy abszurd
                // hosszú kulcs is bejutna, és a taskOrder String(id)-hivatkozása
                // sem illeszkedne rá megbízhatóan.
                if (!TASK_ID.test(key)) {
                    errors.push("A listaelem azonosítója hibás.");
                    break;
                }
                const task = tasks[key];
                if (!task || typeof task !== "object" || Array.isArray(task)) {
                    errors.push("A listaelemek formátuma hibás.");
                    break;
                }
                /* Csak az ismert mezők. A Mongoose-séma "tasks: {type: Object}"-ot
                   mond, tehát bármit eltárolna: ismeretlen kulcsok tiltása nélkül
                   egy saját kliens tetszőleges adatot rejthetne a listaelemekbe,
                   ami onnan az exportokba és a mentésekbe is átfolyna. */
                if (Object.keys(task).some((field) => !TASK_FIELDS.includes(field))) {
                    errors.push("A listaelem ismeretlen mezőt tartalmaz.");
                    break;
                }
                if (!isText(task.content) || task.content.length > MAX_TASK_TEXT) {
                    errors.push(`A listaelem szövege legfeljebb ${MAX_TASK_TEXT} karakter lehet.`);
                    break;
                }
                if (typeof task.done !== "boolean") {
                    errors.push("A listaelemek formátuma hibás.");
                    break;
                }
                /* A task.id a KULCS redundáns mása (a frontend key.toString()-gel
                   állítja elő). Az `id` engedélyezett mező (TASK_FIELDS), tehát a
                   fenti ismeretlen-mező-szűrő nem fogja meg — ellenőrizetlenül egy
                   saját kliens ide tetszőleges típusú/méretű adatot rejthetne, ami
                   tárolódik és az exportba is átfolyik. Kössük a kulcshoz: pontosan
                   az a string lehet, aminek a frontend is szánta. Így a mező
                   alakja (TASK_ID) és mérete a kulcséval együtt garantált. */
                if (task.id !== key) {
                    errors.push("A listaelem azonosítója nem egyezik.");
                    break;
                }
            }
        }
    }

    const taskOrder = body.taskOrder;
    if (taskOrder !== undefined && taskOrder !== null) {
        if (!Array.isArray(taskOrder) || !taskOrder.every(isInteger)) {
            errors.push("A listaelemek sorrendje hibás.");
        } else if (new Set(taskOrder).size !== taskOrder.length) {
            /* A taskOrder a listaelemek MEGJELENÍTÉSI sorrendje: minden elem
               PONTOSAN EGYSZER szerepel benne. Az ismétlődés sosem jogos (a
               nézet ugyanazt az elemet kétszer rajzolná), és ez egyben a
               MÉRET-KORLÁT is: külön hosszkorlát REDUNDÁNS lenne. Ha nincs
               ismétlődés, minden elem létező kulcsra mutat (lenti ellenőrzés) és
               a kulcsokból legfeljebb MAX_TASK_COUNT van, akkor a taskOrder
               hossza is legfeljebb ennyi — egy [1, 1, 1, …] alakú, akármilyen
               hosszú tömböt tehát már itt elutasítunk. */
            errors.push("A listaelemek sorrendje ismétlődő elemet tartalmaz.");
        } else {
            /* A taskOrder a tasks KULCSAIRA hivatkozik. Ha olyanra mutat, ami
               nincs meg, a lista-nézet elhasal rajta (todoUpdate.tsx:
               tasks[order].done egy undefined-on) — a felhasználó a SAJÁT
               főoldalán kapna hibaképernyőt, és onnan nem tudná visszacsinálni,
               mert a hibás elem szerkesztője is elérhetetlenné válna. */
            const known = (tasks && typeof tasks === "object" && !Array.isArray(tasks)) ? Object.keys(tasks) : [];
            if (taskOrder.some((id) => !known.includes(String(id))))
                errors.push("A listaelemek sorrendje nem létező elemre hivatkozik.");
        }
    }

    return errors;
}

// Létrehozáshoz és módosításhoz: a törzs ellenőrzése, majd a hiányzó tasks
// egységesítése {}-re, hogy a százalékszámítás ne undefined-on hasaljon el.
const validateTodoBody = (request, response, next) => {
    const errors = todoErrors(request.body ?? {});
    if (errors.length) return response.status(400).json(errors.join(" "));
    request.body.tasks = request.body.tasks ?? {};
    request.body.taskOrder = request.body.taskOrder ?? [];
    next();
};
/* ÖNLEÍRÁS: „ez a middleware egy kérés-TÖRZSET validál" — mint a Model.exportName
   nyilatkozata. A szekció-router bekötés-kapuja (validationBoundary.test.js) ebből
   ismeri fel, hogy a create/update láncában VAN törzs-ellenőrzés, anélkül hogy
   szekciónkénti kézi validátor-listát kéne tartania (derived). Egy új szekció
   törzs-validátorának is meg kell jelölnie magát; ha elmarad, a kapu HANGOSAN
   jelez — nem néma kihagyás. */
validateTodoBody.validatesBody = true;

/* A szűrő-végpontok (/category, /color) a body mezőit EGYENESEN a lekérdezésbe
   teszik. A user: request.userId miatt idegen adat így sem szivároghatna ki, de
   egy {"$ne": null} a saját szűrésünk jelentését változtatná meg — a kategória-
   nézet az összes elemet adná vissza. Operátor ne juthasson a szűrőbe. */
const validateCategoryFilter = (request, response, next) => {
    if (!isText(request.body?.category)) return response.status(400).json("Érvénytelen kategória.");
    next();
};

const validateColorFilter = (request, response, next) => {
    if (!COLORS.includes(request.body?.color)) return response.status(400).json("Ismeretlen szín.");
    next();
};

/* Az id- és a sorszám-ellenőrzés NEM innen jön: azok minden szekcióban azonosak,
   ezért a közös validators.js-ben élnek, és a routes.js onnan is importálja őket. */
module.exports = {validateTodoBody, validateCategoryFilter, validateColorFilter};
