/* WHITELIST a kifelé menő dokumentum-válaszokhoz — egy helyen, minden szekciónak.

   A PROBLÉMA. A lista- és egy-elemes olvasó végpontok a Mongoose-dokumentumot
   `response.json(doc)`-kal küldik ki. Alapból ez a TELJES dokumentumot
   szerializálja: a tulajdonos azonosítóját (`user`), a séma-verziót (`__v`) és az
   időbélyegeket is — olyan mezőket, amiket a frontend nem használ, és amiknek a
   dróton semmi keresnivalójuk (least privilege). Rosszabb: ha később egy ÉRZÉKENY
   mező kerül a sémába, az BLACKLIST mellett automatikusan kiszivárogna, némán.

   A MEGOLDÁS whitelist, nem blacklist: a transzformáció ÚJ objektumot épít, és CSAK
   a felsorolt mezőket teszi bele. Ami nincs a listán — beleértve a jövőbeli új
   mezőket —, az nem megy ki. Ugyanaz az elv, amit az egy-elemes végpontok kézzel
   csináltak (Quotes/readById.js, readForEdit.js); ez kiterjeszti az összes
   doksi-visszaadó végpontra, egyetlen helyről.

   MIÉRT A `toJSON`-ON, ÉS MIÉRT BIZTONSÁGOS A MENTÉSRE. A `set("toJSON", …)` CSAK a
   JSON-szerializálást szűkíti (ezt hívja a `response.json`). A napi export ezzel
   szemben `.lean()`-nel olvas (scripts/daily-export.js), ami sima objektumot ad,
   NEM Mongoose-dokumentumot — arra a `toJSON` nem fut le. A mentés tehát továbbra
   is a TELJES dokumentumot kapja (a `user` és az időbélyegek nélkül visszaállítani
   sem lehetne), a HÁLÓZAT viszont csak a whitelistet. A `toObject`-et sem érinti,
   csak a `toJSON`-t — a kettő Mongoose-ban külön beállítás.

   ⚠ A KETTŐS KÖTÉS: a lista minden mezőjének a frontend valibot-sémájában is
   szerepelnie kell (frontend/src/types/api.ts, quoteSchema/todoSchema) — a kettőt
   együtt kell mozgatni. A veszélyes irányt a séma-ellenőrzés fogja: ha innen KIESIK
   egy mező, amit a frontend vár, a `v.parse` elutasítja a választ, és a kliens
   szerződés-hibát jelent a Pi naplójába (contractFault.ts) — nem néma. */
function publicJsonTransform(fields) {
    return {
        transform(document, serialized) {
            const output = {};
            for (const field of fields)
                if (field in serialized) output[field] = serialized[field];
            return output;
        },
    };
}

module.exports = {publicJsonTransform};
