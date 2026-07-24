import {useEffect, useMemo} from "react";
import {Navigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import LinkAuthor from "../Link/author";
import LinkQuoteUpdate from "../Link/quoteUpdate";
import {useAuth} from "../../contexts/auth";
import {useTheme} from "../../contexts/theme";
import {useSortableCards} from "../CardList/useSortableCards";
import SortableCardGrid from "../CardList/SortableCardGrid";

/* Az idézet-lista. A betöltés + húzás közös gépezetét a useSortableCards hook és
   a SortableCardGrid komponens adja (ugyanaz, mint a to-dónál); itt csak az
   idézet-SPECIFIKUS rész marad: a szerző-szűrő és a kártya TARTALMA.

   Az idézetnek nincs saját színe (a to-do color-választója itt nincs), ezért a
   kártya a TÉMA színét viseli — a keret és a szöveg is. */
export default function QuoteRead(props) {
    const {author} = useParams();
    const {handleAxios} = useAuth();
    const {color} = useTheme();

    const needsFilter = props.url === "/quotes/author";
    /* A "névtelen" idézeteket a URL-ben "Anonymous" jelöli (üres szerző nem lehet
       URL-szegmens); a szervernek viszont üres stringgel szűrünk rájuk. */
    const filter = useMemo(
        () => (author != null ? {author: author === "Anonymous" ? "" : author} : null),
        [author],
    );
    const missingFilter = needsFilter && !filter;

    const {cards, isLoading, ...grid} = useSortableCards({
        url: props.url, filter, reorderUrl: "/quotes/reorder", handleAxios, skip: missingFilter,
    });

    // A gyökér-átirányítás ide tér vissza: jelöljük, hogy az idézetek az utolsó
    // megnyitott szekció (a szűrt nézetek is a /quotes gyökérre mutatnak).
    useEffect(() => {
        localStorage.setItem("lastSection", "/quotes");
    }, []);

    // Szűrő nélküli szűrt nézet: vissza az idézet-listára (replace, hogy a
    // zsákutca ne kerüljön az előzményekbe).
    if (missingFilter) return <Navigate to="/quotes" replace/>;

    // ÜRES szűrt nézet (az utolsó ilyen szerzőjű idézetet átírták/törölték) —
    // vissza a teljes listára. A teljes lista LEGITIMEN lehet üres.
    if (needsFilter && Array.isArray(cards) && cards.length === 0)
        return <Navigate to="/quotes" replace/>;

    if (isLoading) return <Spinner class="min-vh-75"/>;

    return (
        <SortableCardGrid cards={cards} {...grid} renderCard={(quote) =>
            <div className={"card bg-transparent border-2 border-" + color}>
                <LinkQuoteUpdate quote={quote} color={color} handleLinkClicked={props.handleLinkClicked}/>
                <LinkAuthor author={quote.author} color={color} onClick={props.handleLinkClicked}
                            class={"card-footer small text-center bg-transparent mx-2 border-" + color}/>
            </div>
        }/>
    );
}
