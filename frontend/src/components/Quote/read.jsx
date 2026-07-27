import {useEffect, useMemo} from "react";
import {Navigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import QuoteCard from "./card";
import {useAuth} from "../../contexts/auth-context";
import {useTheme, ACCENT_RED} from "../../contexts/theme-context";
import {useSortableCards} from "../CardList/useSortableCards";
import SortableCardGrid from "../CardList/SortableCardGrid";

/* Az idézet-lista. A betöltés + húzás közös gépezetét a useSortableCards hook és
   a SortableCardGrid komponens adja (ugyanaz, mint a to-dónál); itt csak az
   idézet-SPECIFIKUS rész marad: a szerző-szűrő. A kártya TARTALMA a KÖZÖS
   QuoteCard (a keresési találat is ezt használja). */
export default function QuoteRead(props) {
    const {author} = useParams();
    const {handleAxios} = useAuth();
    const {setAccentOverride} = useTheme();

    const needsFilter = props.url === "/quotes/author";
    /* A "névtelen" idézeteket a URL-ben "Anonymous" jelöli (üres szerző nem lehet
       URL-szegmens); a szervernek viszont üres stringgel szűrünk rájuk. A csupasz
       /quotes (:author nélkül) nem ide, hanem a szűretlen listára jut, a szűrt
       nézetet pedig a route :author paramétere garantálja — külön őr itt nem kell. */
    const filter = useMemo(
        () => (author != null ? {author: author === "Anonymous" ? "" : author} : null),
        [author],
    );

    const {cards, isLoading, ...grid} = useSortableCards({
        url: props.url, filter, reorderUrl: "/quotes/reorder", handleAxios,
    });

    // A gyökér-átirányítás ide tér vissza: jelöljük, hogy az idézetek az utolsó
    // megnyitott szekció (a szűrt nézetek is a /quotes gyökérre mutatnak).
    useEffect(() => {
        localStorage.setItem("lastSection", "/quotes");
    }, []);

    /* A szerző-szűrt nézet PIROS akcentust ad az EGÉSZ appnak (navbar, scrollbar,
       gombok, toggle, kártyák — l. ACCENT_RED / ThemeProvider), jelezve a szűrt
       módot; a nézetből kilépve (unmount vagy needsFilter false) visszaáll a témáé.
       Így a kártyák külön pirosítása is fölöslegessé vált (a border-theme/text-theme
       maga is a --theme-accent-ből fest).

       CSAK akkor pirosítunk, ha VAN találat: egy üres szűrt nézet (pl. /quotes/search
       → "search" nevű szerző nincs) amúgy is visszairányít a főlistára, és a piros
       megvillanna az ugrás előtt. A `hasFilteredResults` BOOLEAN (nem a cards
       identitása), így a húzás-átrendezés (cards-mutáció) nem billegteti a színt. */
    const hasFilteredResults = needsFilter && Array.isArray(cards) && cards.length > 0;
    useEffect(() => {
        if (!hasFilteredResults) return;
        setAccentOverride(ACCENT_RED);
        return () => setAccentOverride(null);
    }, [hasFilteredResults, setAccentOverride]);

    // ÜRES szűrt nézet (az utolsó ilyen szerzőjű idézetet átírták/törölték) —
    // vissza a teljes listára. A teljes lista LEGITIMEN lehet üres.
    if (needsFilter && Array.isArray(cards) && cards.length === 0)
        return <Navigate to="/quotes" replace/>;

    if (isLoading) return <Spinner class="min-vh-75"/>;

    return (
        <SortableCardGrid cards={cards} {...grid} renderCard={(quote) =>
            <QuoteCard quote={quote} handleLinkClicked={props.handleLinkClicked}/>
        }/>
    );
}
