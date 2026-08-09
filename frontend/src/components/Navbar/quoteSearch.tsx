import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import AuthorInput from "../Quotes/authorInput";
import {useAuth} from "../../contexts/auth-context";
import {useTheme} from "../../contexts/theme-context";
import {logRequestError} from "../../log";
import type {SearchMode} from "../../types/api";

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

export default function QuoteSearch(props: QuoteSearchProps) {
    const {handleAxios} = useAuth();
    const {color} = useTheme();
    const navigate = useNavigate();

    // A mező a hívó által az URL-ből számolt kezdőértékkel indul, és követi is az
    // URL változását (más szerzőre/keresésre lépve a mező is átáll).
    const [term, setTerm] = useState(props.initialTerm);
    useEffect(() => setTerm(props.initialTerm), [props.initialTerm]);

    const runSearch = () => {
        const trimmed = term.trim();
        // Üres keresés (üres mező vagy csak szóköz) → vissza a teljes listára (főoldal).
        if (!trimmed) {
            props.handleLinkClicked?.();
            navigate("/quotes");
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
            navigate("/quotes/Anonymous");
            return;
        }
        /* A <SearchMode> nem csak megnevezi a választ: a diszkriminált unió miatt a
           `response.data.author` sor CSAK a mode-vizsgálat ága alatt fordul le
           (l. types/api.ts). */
        handleAxios<SearchMode>("/quotes/search-mode", {term: trimmed}, (response) => {
            props.handleLinkClicked?.();
            if (response.data.mode === "author")
                navigate("/quotes/" + encodeURIComponent(response.data.author));
            else
                navigate("/quotes/search/" + encodeURIComponent(trimmed));
        }, logRequestError);
    };

    return (
        // Az igazítást (commitolt kifejezés középen/unfókuszáltan, gépeléskor balra)
        // és a fókusz-alapú ghost-ot maga az AuthorInput intézi kereső módban.
        /* Az `event` típusát innen az AuthorInput onChange-propja adja (ValueChange:
           {target:{value}}) — a korábbi kézi ChangeEvent-annotáció elhagyható lett,
           amint az AuthorInput átkerült TypeScriptre. */
        <AuthorInput value={term} onChange={(event) => setTerm(event.target.value)}
                     onSubmit={runSearch} onFocusChange={props.onFocusChange}
                     placeholder="Keresés..." wrapperClass="w-100"
                     class={"caveat text-" + color}/>
    );
}
