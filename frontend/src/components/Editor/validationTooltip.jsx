import {Tooltip as ReactTooltip} from "react-tooltip";
import {TOOLTIP_MIDDLEWARES} from "../../tooltipMiddlewares";

/* A magyar határozott névelő a mezőnév KEZDŐBETŰJÉBŐL: magánhangzó → "Az",
   egyébként "A". Az ékezetes magánhangzók is benne vannak (idézet, ábra, ütem…);
   a hosszú párokat külön fel kell sorolni, a regex nem normalizál. */
const STARTS_WITH_VOWEL = /^[aáeéiíoóöőuúüű]/i;

/* A kötelező-mező hibabuborék — a NATÍV böngésző-buborék helyett, mert azt nem
   lehet stílusozni. A "Sorszám" tooltip kinézetét viseli: lap-háttér, kiemelőszínű
   keret és szöveg. A pozíciót a fieldAnchor méri ki (a placeholder közepe),
   place=bottom-mal a nyíl a placeholder ALÁ esik.

   A `validation` a szerkesztő state-je: null = nincs hiba, egyébként a fieldAnchor
   visszatérési értéke ({anchor, name, pos}).

   Az `id` azért PROP, mert egy lapon több tooltip is élhet, és a react-tooltip
   id-vel azonosítja őket — a to-do és az idézet-szerkesztő ezért külön id-t ad.

   A middlewares (l. tooltipMiddlewares.js) itt a LEGFONTOSABB: ez a buborék egy
   PONTRA horgonyzik (a placeholder közepére), nem elemre, ezért telefon-szélességen
   a bal képernyőszélhez kerül közel — a react-tooltip alapbeállításával ilyenkor
   oldalra, a mezőre nyílt ki. */
export default function ValidationTooltip({id, validation}) {
    return (
        <ReactTooltip id={id} isOpen={validation !== null}
                      position={validation?.pos} place="bottom" middlewares={TOOLTIP_MIDDLEWARES}
                      disableStyleInjection={true} border="1px solid var(--theme-accent)"
                      style={{zIndex: 20, backgroundColor: "var(--theme-page-bg)",
                          color: "var(--theme-accent)"}}>
            {validation &&
                `${STARTS_WITH_VOWEL.test(validation.name) ? "Az" : "A"} ` +
                `${validation.name} kitöltése kötelező.`}
        </ReactTooltip>
    );
}
