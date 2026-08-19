/* Egy kötelező mező hibabuborékjának HORGONYA: hova mutasson a buborék nyila, és
   milyen néven nevezzük a mezőt az üzenetben.

   A buborékot a mező placeholderének KÖZEPÉRE horgonyozzuk (nem a mező közepére):
   a szöveg félszélességét a mező SAJÁT betűjével mérjük egy canvas-szal, és a bal
   paddinghoz adjuk. Enélkül egy hosszú inputnál a nyíl a mező közepén, a
   placeholder-szövegtől messze állna.

   A mérés canvasszal megy, mert a DOM nem ad szövegszélességet: a
   `measureText` a betűtípussal, -mérettel és -vastagsággal együtt számol, tehát a
   mező tényleges `font`-ját másoljuk rá.

   A `name` a hibaüzenet mezőneve. Alapból a placeholder kisbetűs alakja (egy új
   mezőnél magától helyes lesz a felirat), de felülírható, ha az üzenetben rövidebb
   név kell, mint a placeholderben (pl. "Idézet szövege" → "idézet"); a POZÍCIÓT
   akkor is a placeholder szélessége adja.

   A `boundary` a mezőt tartalmazó ŰRLAP — ez egyben a szerkesztő KÁRTYÁJA (a form
   viseli a card osztályt). A buborék ezen belül marad: kilógva a kártya
   kiemelőszínű keretét takarná ki, mert a buborék háttere lapszínű, tehát a
   keretvonalon egy rés maradna. Itt vesszük ki, mert a mező-elem úgyis a kezünkben
   van; ha a mező nincs űrlapban (teszt), marad az alapértelmezett képernyő-határ.

   Visszaadott alak: {anchor, name, pos, boundary} — a `validation` state pontosan
   ez, ezt várja a ValidationTooltip. */

/* A horgonyzott mező csak olyan elem lehet, aminek VAN placeholdere: input vagy
   textarea. A `querySelector` típusparamétere ezt mondja ki — enélkül az általános
   `Element`-et adná vissza, aminek a fordító szerint nincs `placeholder` mezője. */
type AnchoredField = HTMLInputElement | HTMLTextAreaElement;

/* Exportált: a fogyasztójával EGYÜTT nő (mint a types/api.ts szerződés-típusai) —
   a ValidationTooltip a `validation` propja típusához veszi, a két szerkesztő
   (Todos/Quotes save) pedig a `validation` state-jéhez (`FieldAnchor | null`). */
export type FieldAnchor = {
    anchor: string;
    name: string;
    boundary: HTMLFormElement | undefined;
    pos: {x: number; y: number};
};

function elementFor(selector: string): AnchoredField | null {
    const found = document.querySelector(selector);
    return found instanceof HTMLInputElement || found instanceof HTMLTextAreaElement ? found : null;
}

export function fieldAnchor(selector: string, name?: string): FieldAnchor {
    /* A `querySelector<AnchoredField>` alakja kényelmes volna, de az csak ÁLLÍTÁS:
       a típusparaméter nem ellenőriz semmit, csak közli a fordítóval, mit talált.
       Az `instanceof` valóban megnézi — és mivel a null-eset ellenőrzését úgyis el
       kell végezni, ez ingyen jön hozzá.

       A viselkedés VÁLTOZATLAN: eddig is kivétellel állt meg (a null-on hívott
       getBoundingClientRect TypeError-t dobott), csak most megnevezi, mi a baj.
       A hívók a beküldés pillanatában, egy kirajzolt űrlapon hívják, tehát ez a
       hiba fejlesztői elgépelést jelent (rossz szelektor), nem futásidejű esetet. */
    const el: AnchoredField | null = elementFor(selector);
    if (!el) throw new Error(`fieldAnchor: nincs ilyen (szöveges) mező a lapon: ${selector}`);

    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    /* A 2D-kontextus elvileg `null` is lehet (a böngésző megtagadhatja, és a
       jsdom sem ad valódit). Ilyenkor a fél szélesség 0: a buborék a mező bal
       széléhez kerül a placeholder közepe helyett — pontatlanabb, de működik.
       Kivételt dobni ezért nem érdemes: a hiba a POZÍCIÓ finomsága, nem a
       hibajelzés maga, amiért az egész buborék létezik. */
    let half = 0;
    if (ctx) {
        ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
        half = ctx.measureText(el.placeholder).width / 2;
    }

    return {
        anchor: selector,
        name: name ?? el.placeholder.toLowerCase(),
        boundary: el.closest("form") ?? undefined,
        pos: {
            x: r.left + (parseFloat(cs.paddingLeft) || 0) + half,
            y: r.top + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.fontSize) || 16),
        },
    };
}

/* ELEMHEZ igazított horgony — a mező VÍZSZINTES KÖZEPE alatt.

   ELTÉRÉS a fenti `fieldAnchor`-tól (ugyanebben a fájlban): az a placeholder
   SZÖVEGÉNEK közepére mutat, ez pedig magára a MEZŐRE. A különbség ott számít,
   ahol a mező szélesebb a szövegénél: a navbar keresősávja teljes szélességű,
   tehát a szöveghez igazított nyíl a bal széle közelében állna, mintha valami
   máshoz tartozna. A keresés hibája az EGÉSZ sávra vonatkozik, ezért a sáv
   közepe alá kerül.

   A `name` és a `boundary` itt nincs értelmezve: a hibaüzenetet a hívó adja
   szövegként (nem mezőnévből épül), és a keresősáv nem űrlapon belül ül, tehát
   nincs mihez képest bent maradnia — a képernyő az egyetlen határ. */
export function elementAnchor(selector: string): FieldAnchor | null {
    const el = document.querySelector(selector);
    if (!(el instanceof HTMLElement)) return null;

    const r = el.getBoundingClientRect();
    return {
        anchor: selector,
        name: "",
        boundary: undefined,
        // A doboz ALJA, hogy a lefelé nyíló buborék nyila a mező alatt kezdődjön.
        pos: {x: r.left + r.width / 2, y: r.bottom},
    };
}
