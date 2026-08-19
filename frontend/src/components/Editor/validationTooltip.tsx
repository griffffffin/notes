import AnchoredTooltip from "./anchoredTooltip";
import type {FieldAnchor} from "./fieldAnchor";

/* Az `id` PROP (nem konstans): egy lapon több hibabuborék is élhet (a to-do és az
   idézet-szerkesztőé), a react-tooltip id-vel különbözteti meg őket. A `validation`
   a szerkesztő state-je: `null` = nincs hiba, egyébként a fieldAnchor visszatérése.
   Az `onDismiss` a "felejtsd el a hibát" művelet (a validation nullázása). */
type ValidationTooltipProps = {
    id: string;
    validation: FieldAnchor | null;
    onDismiss: () => void;
};

/* A magyar határozott névelő a mezőnév KEZDŐBETŰJÉBŐL: magánhangzó → "Az",
   egyébként "A". Az ékezetes magánhangzók is benne vannak (idézet, ábra, ütem…);
   a hosszú párokat külön fel kell sorolni, a regex nem normalizál. */
const STARTS_WITH_VOWEL = /^[aáeéiíoóöőuúüű]/i;

/* A KÖTELEZŐ-MEZŐ hibabuborék — a NATÍV böngésző-buborék helyett, mert azt nem
   lehet stílusozni. Ez a komponens ma már CSAK a mondatot építi; a megjelenés és a
   viselkedés (pozíció, keret, eltüntetés, képernyőn tartás) a közös
   AnchoredTooltipben van, amit a navbar keresője is használ — így a két
   hibabuborék nem tud elcsúszni egymástól.

   A pozíciót a fieldAnchor méri ki (a placeholder közepe), place=bottom-mal a
   nyíl a placeholder ALÁ esik. */
export default function ValidationTooltip({id, validation, onDismiss}: ValidationTooltipProps) {
    const message = validation
        ? `${STARTS_WITH_VOWEL.test(validation.name) ? "Az" : "A"} ${validation.name} kitöltése kötelező.`
        : "";

    return <AnchoredTooltip id={id} anchor={validation} message={message} onDismiss={onDismiss}/>;
}
