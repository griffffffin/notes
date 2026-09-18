/* A to-do kártyák színpalettája: a hat megengedett NÉV.

   A név Bootstrap-osztálynévbe kerül ("btn-" + color, "border-" + color, "text-"
   + color), és ugyanez a szöveg áll az adatbázisban is, a to-dók `color`
   mezőjében. A lista egyetlen helyen él: ebből épül a szerkesztő színválasztója
   (Button/colorButtonGroup) ÉS a navbar szín-szűrője (Link/colorButtonGroup) —
   korábban mindkettő kézzel sorolta fel őket, és semmi nem jelezte volna, ha az
   egyik lemarad.

   A sorrend a színválasztó gombjainak sorrendje (a navbar szűrője ezt megfordítva
   rendereli, l. az ottani kommentet).

   MIÉRT CSAK NEVEK, HEXEK NÉLKÜL (2026-08-19). Korábban ez egy NÉV → hex map volt,
   azzal az indoklással, hogy "a hexet a sorszám tooltipjének kerete kéri". Ez már
   nem igaz: az a keret CSS-változóból dolgozik (Todos/order.tsx: a téma
   `--theme-accent`-je, vagy to-do-nál a kártya színének `--bs-{color}`-a), és
   MÉRVE egyetlen produkciós fájl sem olvasta a hexeket — csak a neveket és a
   típust. A holt hexek nem is maradtak ártalmatlanok: a `danger`-é a RÉGI
   Bootstrap-piros (#dc3545) maradt, miközben az app egyetlen pirosa azóta #db1937
   (index.css --app-red). Aki legközelebb színt olvasott volna a palettából, némán
   a rossz pirosat kapja. A knip ezt nem foghatta meg: az objektum EXPORTJA
   használatban volt, csak a fele nem — a halott kód mező-szinten nem látszik.
   Ha valaha mégis kell hex, az a CSS-változóból jöjjön, ne innen.

   A `danger` NÉV VISZONT MARAD, és ez nem elmaradt átvezetés: nem a mi szavunk,
   hanem a Bootstrap szótára (`btn-danger`) és a DB-ben tárolt érték. Átnevezni
   csak adatmigrációval lehetne, a backend COLORS-listájával együtt — az a
   DB-átnevezési menet dolga.

   Az `as const` a TypeScript "vedd szó szerint" jelzése. Nélküle a fordító a
   listát `string[]`-gé általánosítaná, és a paletta nem tudna semmit önmagáról:
   egy "primry" elgépelés is átmenne. Vele a típus a HAT konkrét név, amiből a
   `TodoColor` unió közvetlenül származik — nincs kézzel írt párhuzamos felsorolás. */
export const TODO_COLOR_NAMES = ["primary", "info", "secondary", "danger", "warning", "success"] as const;

/* A paletta HAT neve mint típus — az `as const` ígéretének beváltása. Innentől a
   `color` prop nem akármilyen szöveg: egy elgépelt "primry" a fordításnál elbukik,
   nem a felületen (ahol csak annyi látszana, hogy a kártya színtelen marad, mert a
   "btn-primry" Bootstrap-osztály nem létezik). */
export type TodoColor = typeof TODO_COLOR_NAMES[number];

/* Kívülről érkező szöveg (DOM-attribútum, URL-darab, szerver-válasz) SOHA nem
   `TodoColor` magától — a fordító szerint sima `string`. A kézenfekvő megoldás egy
   `as TodoColor` cast volna, de az CSAK ÁLLÍTÁS, nem ellenőrzés (l. CLAUDE.md):
   pont azt a néma hibát engedné vissza, ami ellen a típus van.

   Helyette VALÓDI futásidejű vizsgálat áll itt: tényleg szerepel-e a szó a
   palettában. A `value is TodoColor` visszatérési típus a "típusőr" jelölése —
   ettől a hívó ágában a fordító is a szűk típust látja. Hat elemnél a lineáris
   keresés ára mérhetetlen, viszont `as` nélkül fordul (egy `includes` a szűk
   tuple-ön castot kívánna, mert a paraméterét `TodoColor`-nak várja). */
export const isTodoColor = (value: string): value is TodoColor =>
    TODO_COLOR_NAMES.some((name) => name === value);
