const mongoose = require("mongoose");

/* A kérés törzsének ellenőrzése, MIELŐTT bármi az adatbázisig jutna.

   Miért kell, ha a Mongoose-sémán is van required/type? Két okból:
   (1) a findByIdAndUpdate alapból NEM futtat sémavalidátort, tehát a módosítás
       eddig bármit beírhatott (üres cím, kitalált szín);
   (2) a séma a TÍPUST nézi, a tartalmat nem — hosszkorlát, szín-paletta és
       sorszám-tartomány nélkül egy saját kliens tetszőleges méretű és értékű
       adatot tölthetett volna be.

   A típus-szigor egyben NoSQL-injekció ellen is véd: ha a "title" helyére
   valaki egy {"$ne": null}-szerű objektumot küld, azt itt elutasítjuk, mert
   nem string — így operátor sosem jut le a lekérdezésbe. */

const SZINEK = ["primary", "info", "secondary", "danger", "warning", "success"];
const MAX_CIM = 200;
const MAX_KATEGORIA = 100;
const MAX_TASK_SZOVEG = 1000;
const MAX_TASK_DARAB = 500;
const MAX_SORSZAM = 100000;

const szoveg = (ertek) => typeof ertek === "string";
const egesz = (ertek) => typeof ertek === "number" && Number.isInteger(ertek);

function todoHibak(body) {
    const hibak = [];

    if (!szoveg(body.title) || !body.title.trim()) hibak.push("A cím megadása kötelező.");
    else if (body.title.length > MAX_CIM) hibak.push(`A cím legfeljebb ${MAX_CIM} karakter lehet.`);

    if (!szoveg(body.category) || !body.category.trim()) hibak.push("A kategória megadása kötelező.");
    else if (body.category.length > MAX_KATEGORIA)
        hibak.push(`A kategória legfeljebb ${MAX_KATEGORIA} karakter lehet.`);

    if (!SZINEK.includes(body.color)) hibak.push("Ismeretlen szín.");

    if (!egesz(body.order) || body.order < 1 || body.order > MAX_SORSZAM) hibak.push("Érvénytelen sorszám.");

    // A tasks elhagyható (üres to-do), de ha van, valódi objektum legyen —
    // tömb és null nem: azokon a lenti bejárás csendben rosszat csinálna.
    const tasks = body.tasks;
    if (tasks !== undefined && tasks !== null) {
        if (typeof tasks !== "object" || Array.isArray(tasks)) hibak.push("A listaelemek formátuma hibás.");
        else {
            const kulcsok = Object.keys(tasks);
            if (kulcsok.length > MAX_TASK_DARAB) hibak.push(`Legfeljebb ${MAX_TASK_DARAB} listaelem lehet.`);
            for (const kulcs of kulcsok) {
                const task = tasks[kulcs];
                if (!task || typeof task !== "object" || Array.isArray(task)) {
                    hibak.push("A listaelemek formátuma hibás.");
                    break;
                }
                if (!szoveg(task.content) || task.content.length > MAX_TASK_SZOVEG) {
                    hibak.push(`A listaelem szövege legfeljebb ${MAX_TASK_SZOVEG} karakter lehet.`);
                    break;
                }
                if (typeof task.done !== "boolean") {
                    hibak.push("A listaelemek formátuma hibás.");
                    break;
                }
            }
        }
    }

    const taskOrder = body.taskOrder;
    if (taskOrder !== undefined && taskOrder !== null) {
        if (!Array.isArray(taskOrder) || !taskOrder.every(egesz)) hibak.push("A listaelemek sorrendje hibás.");
    }

    return hibak;
}

// Létrehozáshoz és módosításhoz: a törzs ellenőrzése, majd a hiányzó tasks
// egységesítése {}-re, hogy a százalékszámítás ne undefined-on hasaljon el.
const validateTodoBody = (request, response, next) => {
    const hibak = todoHibak(request.body ?? {});
    if (hibak.length) return response.status(400).json(hibak.join(" "));
    request.body.tasks = request.body.tasks ?? {};
    request.body.taskOrder = request.body.taskOrder ?? [];
    next();
};

// Módosításhoz, törléshez, egy elem olvasásához: az id formája.
// Enélkül a Mongoose CastError-t dobna, amiből 400 "Error: CastError…" lett.
const validateTodoId = (request, response, next) => {
    if (!mongoose.isValidObjectId(request.body?.id)) return response.status(400).json("Érvénytelen azonosító.");
    next();
};

module.exports = {validateTodoBody, validateTodoId, todoHibak, SZINEK};
