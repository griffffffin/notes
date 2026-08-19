import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import AuthorInput from "../Quotes/authorInput";
import {useAuth} from "../../contexts/auth-context";
import {useTheme} from "../../contexts/theme-context";
import {logRequestError} from "../../log";
import {ENDPOINTS} from "../../endpoints";
import {searchModeSchema} from "../../types/api";
import {PATHS} from "../../paths";
import {parseResponse} from "../../contractFault";
import AnchoredTooltip from "../Editor/anchoredTooltip";
import {elementAnchor} from "../Editor/fieldAnchor";
import type {FieldAnchor} from "../Editor/fieldAnchor";

/* A Quotes-navbar keresője (a "+" és a kijelentkezés között, középen). A ghost-
   text szerző-ajánlást a szerkesztővel KÖZÖS AuthorInput adja (onSubmit móddal:
   Enterre keres, nem javaslatot fogad el).

   Beküldéskor a /quotes/search-mode dönti el a módot (szerző- vs szöveg-mód, l. a
   backend readSearchMode-ját), és aszerint navigálunk: szerző-mód → a szerző-
   szűrt nézetre (/quotes/:author, a TÁROLT írásmóddal), szöveg-mód → a találatra
   (/quotes/search/:term). Így minden URL önmagában, F5 után is konzisztens. */
type QuoteSearchProps = {
    /* A mező kezdőértéke, az URL-ből számolva (l. quoteSearchState) — nem a
       kereső találja ki, hanem a cím mondja meg, mi van beírva. */
    initialTerm: string;
    /* Opcionális: a navbar legördülőinek becsukása navigálás előtt. Ahol nincs mit
       becsukni, ott elmarad — ezért hívjuk `?.()`-tel. */
    handleLinkClicked?: () => void;
    /* Fókuszba került-e a mező. Mobilon a sáv ilyenkor átveszi a navbart. */
    onFocusChange: (isFocused: boolean) => void;
};

/* A keresősáv beviteli mezőjének azonosítója — a hibabuborék EHHEZ horgonyzik.
   Konstansként, mert két helyen kell (a mezőn és a horgonyzásnál), és a kettő
   elcsúszása néma lenne: a buborék a képernyő bal felső sarkába kerülne. */
const SEARCH_INPUT_ID = "quoteSearchField";

export default function QuoteSearch(props: QuoteSearchProps) {
    const {handleAxios} = useAuth();
    const {color} = useTheme();
    const navigate = useNavigate();

    // A mező a hívó által az URL-ből számolt kezdőértékkel indul, és követi is az
    // URL változását (más szerzőre/keresésre lépve a mező is átáll).
    const [term, setTerm] = useState(props.initialTerm);
    /* A keresés HIBÁJÁNAK horgonya (null = nincs hiba). A típus kimondva, mert a
       kezdőérték null (l. CLAUDE.md, "kezdőérték ≠ típus"). */
    const [searchError, setSearchError] = useState<FieldAnchor | null>(null);
    useEffect(() => setTerm(props.initialTerm), [props.initialTerm]);

    const runSearch = () => {
        const trimmed = term.trim();
        // Üres keresés (üres mező vagy csak szóköz) → vissza a teljes listára (főoldal).
        if (!trimmed) {
            props.handleLinkClicked?.();
            void navigate(PATHS.quotes);
            return;
        }
        /* Az "Anonymous" a névtelen (üres szerzőjű) idézetek URL-jelölője — a
           felületről máshonnan nem elérhető, ezért a keresőből visz oda: a
           szerző-szűrt /quotes/Anonymous nézetre, nem a mód-döntésen át (a
           szöveg-mód a szó előfordulásait keresné, nem a névteleneket).
           Kis-/nagybetűtől függetlenül (aNoNYMous is jó); a cél mindig a
           kanonikus "Anonymous" jelölő. */
        if (trimmed.toLowerCase() === "anonymous") {
            props.handleLinkClicked?.();
            void navigate(PATHS.quotesByAuthor("Anonymous"));
            return;
        }
        handleAxios(ENDPOINTS.quoteSearchMode, {term: trimmed}, (response) => {
            setSearchError(null);
            /* A séma nem csak megnevezi a választ, ELLENŐRZI is: a diszkriminált
               unió miatt a `mode.author` sor CSAK a mode-vizsgálat ága alatt fordul
               le (l. types/api.ts), és futásidőben is csak akkor van ott. Egy
               "author" módú válasz szerző NÉLKÜL így nem az URL-be írt "undefined"
               szót eredményezi, hanem elutasított választ: maradunk a helyünkön, a
               hiba a naplóba megy. */
            const mode = parseResponse(searchModeSchema, response.data, ENDPOINTS.quoteSearchMode);
            props.handleLinkClicked?.();
            if (mode.mode === "author")
                void navigate(PATHS.quotesByAuthor(mode.author));
            else
                void navigate(PATHS.quoteSearch(trimmed));
        }, (error) => {
            logRequestError(error);
            /* A KERESÉS NEM INDULT EL — és eddig ez pontosan úgy nézett ki, mint
               ha a felület meg sem hallotta volna az Entert: nem navigáltunk, nem
               írtunk semmit. A buborék a keresősáv ALÁ kerül, a SÁV közepéhez
               igazítva (nem a beírt szöveghez): a hiba az egész műveletre
               vonatkozik, nem egy szó helyére. */
            setSearchError(elementAnchor("#" + SEARCH_INPUT_ID));
        });
    };

    return (
        // Az igazítást (commitolt kifejezés középen/unfókuszáltan, gépeléskor balra)
        // és a fókusz-alapú ghost-ot maga az AuthorInput intézi kereső módban.
        /* Az `event` típusát innen az AuthorInput onChange-propja adja (ValueChange:
           {target:{value}}) — a korábbi kézi ChangeEvent-annotáció elhagyható lett,
           amint az AuthorInput átkerült TypeScriptre. */
        <>
            <AuthorInput value={term} inputId={SEARCH_INPUT_ID}
                         onChange={(event) => { setTerm(event.target.value); setSearchError(null); }}
                         onSubmit={runSearch} onFocusChange={props.onFocusChange}
                         placeholder="Keresés..." wrapperClass="w-100"
                         class={"caveat text-" + color}/>
            {/* A hibabuborék ugyanaz a komponens, amit a szerkesztők kötelező-mező
                jelzése is használ (AnchoredTooltip) — azonos keret, szín és
                viselkedés. Gépelésre és bárhova kattintásra eltűnik. */}
            <AnchoredTooltip id="quote-search-error" anchor={searchError} tone="red"
                             message="Hiba a keresés indításakor."
                             onDismiss={() => setSearchError(null)}/>
        </>
    );
}
