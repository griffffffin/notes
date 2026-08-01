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
export function fieldAnchor(selector, name) {
    const el = document.querySelector(selector);
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = cs.font || `${cs.fontSize} ${cs.fontFamily}`;
    const half = ctx.measureText(el.placeholder).width / 2;
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
