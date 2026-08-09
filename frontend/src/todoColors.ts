/* A to-do kártyák színpalettája: NÉV → hex.

   A név a Bootstrap-osztályokba kerül ("border-" + color), a hexet a sorszám
   tooltipjének kerete kéri. Korábban a kettő két külön helyen élt: a nevek a
   ColorButtonGroup JSX-ében felsorolva, a hexek a Save egyik switch-ében —
   egy új szín felvétele tehát két fájl összehangolt szerkesztését kívánta,
   és semmi nem jelezte volna, ha az egyik kimarad.

   A kulcsok sorrendje egyben a színválasztó gombok sorrendje.

   Az `as const` a TypeScript "vedd szó szerint" jelzése. Nélküle a fordító a
   mezőket egyszerű `string`-nek általánosítaná, és a paletta nem tudna semmit
   önmagáról: egy `TODO_COLORS["primry"]` elgépelés is átmenne. Vele a típus a
   HAT konkrét kulcs és a hozzájuk tartozó konkrét hex — ebből a színválasztó
   majd `keyof typeof TODO_COLORS`-szal származtathatja a megengedett neveket,
   ahelyett hogy külön felsorolná őket (a fenti kettősség modern alakja). */
export const TODO_COLORS = {
    primary: "#0d6efd",
    info: "#0dcaf0",
    secondary: "#6c757d",
    danger: "#dc3545",
    warning: "#ffc107",
    success: "#198754",
} as const;

/* A paletta HAT neve mint típus — az `as const` ígéretének beváltása. Innentől a
   `color` prop nem akármilyen szöveg: egy elgépelt "primry" a fordításnál elbukik,
   nem a felületen (ahol csak annyi látszana, hogy a kártya színtelen marad, mert a
   "btn-primry" Bootstrap-osztály nem létezik). */
export type TodoColor = keyof typeof TODO_COLORS;

/* Miért nem elég az `Object.keys(TODO_COLORS)`? Mert annak típusa `string[]`, és
   ez SZÁNDÉKOS a TypeScriptben: egy objektumnak futásidőben lehet több mezője,
   mint amennyit a típusa kimond (pl. ha máshonnan kapott értéket adnánk át), így
   a kulcsokról a fordító nem állíthatja biztosan, hogy csak a hat név lehet.

   A kézenfekvő megoldás egy `as TodoColor[]` cast volna — de az CSAK ÁLLÍTÁS,
   nem ellenőrzés (l. CLAUDE.md), tehát pont azt a néma hibát engedné vissza,
   ami ellen a típus van. Helyette egy VALÓDI futásidejű vizsgálat áll itt: az
   `in` operátor megnézi, tényleg szerepel-e a kulcs a palettában. A `value is
   TodoColor` visszatérési típus a "típusőr" jelölése — ettől a `filter` nem
   `string[]`-et, hanem `TodoColor[]`-t ad vissza.

   A sorrend a TODO_COLORS sorrendje marad (a `filter` nem rendez át) — erre a
   színválasztó és a navbar szín-szűrője is épít. */
export const isTodoColor = (value: string): value is TodoColor => value in TODO_COLORS;

export const TODO_COLOR_NAMES = Object.keys(TODO_COLORS).filter(isTodoColor);
