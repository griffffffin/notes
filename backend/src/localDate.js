/* HELYI dátum YYYY-MM-DD alakban.

   Miért nem `toISOString().slice(0, 10)`? Mert az UTC-re vált, a szerver pedig
   helyi idő szerint gondolkodik. A napi export a HELYI éjféltől éjfélig tartó
   ablakot vizsgálja; nyáron (CEST = UTC+2) a helyi éjfél UTC-ben az ELŐZŐ nap
   22:00, tehát az ISO-alak egy nappal korábbi dátumot ad.

   Ez néma hiba volt: az export a helyes nap adatait mentette, csak a FÁJLNEVE
   hazudott egy napot — vagyis pont az az információ csúszott el, ami alapján egy
   visszaállításnál a fájlt kiválasztanánk. Semmi nem hibázott, a mentés
   lefutott, a méret is stimmelt.

   Télen (CET = UTC+1) ugyanez történik; a hiba csak akkor tűnne el, ha a szerver
   UTC-ben járna. Ezért a formázás explicit helyi mezőkből épül. */
const localDateString = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

module.exports = {localDateString};
