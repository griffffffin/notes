import {useEffect, useMemo} from "react";
import {Navigate, useParams} from "react-router-dom";
import Spinner from "../spinner";
import QuoteCard from "./card";
import {useAuth} from "../../contexts/auth-context";
import {useSortableCards} from "../CardList/useSortableCards";
import SortableCardGrid from "../CardList/SortableCardGrid";

/* A keresés SZÖVEG-módjának találati nézete (/quotes/search/:term): azok az
   idézetek, amelyekben a keresett kifejezés a szövegben VAGY a szerzőben
   előfordul (a backend /quotes/search adja, csupasz tömbként).

   A lista + húzás gépezetét a szerző-szűrt nézettel AZONOS módon használja
   (useSortableCards + SortableCardGrid, /quotes/reorder): a találat PONTOSAN úgy
   rendezhető át, mint egy szerző alatt — ugyanaz a globális sorszám, ugyanaz a
   reprodukálható relatív sorrend (l. a döntést a húzhatóságról). A kártya a
   KÖZÖS QuoteCard.

   Üres találat → néma vissza a teljes listára (a szerző-szűrt nézet mintája): a
   keresésnek nincs külön "nincs találat" felülete. */
export default function QuoteSearchResults(props) {
    const {term} = useParams();
    const {handleAxios} = useAuth();

    // A useParams a route-paramétert MÁR dekódolva adja (mint a szerzőnél) —
    // nem kell újra decodeURIComponent, az kétszeres dekódolás lenne.
    const filter = useMemo(() => ({term}), [term]);

    const {cards, isLoading, ...grid} = useSortableCards({
        url: "/quotes/search", filter, reorderUrl: "/quotes/reorder", handleAxios,
    });

    // A gyökér-átirányítás ide is a Quotes szekcióra tér vissza (a találat is
    // idézet-nézet) — mint a QuoteRead.
    useEffect(() => {
        localStorage.setItem("lastSection", "/quotes");
    }, []);

    if (Array.isArray(cards) && cards.length === 0) return <Navigate to="/quotes" replace/>;
    if (isLoading) return <Spinner class="min-vh-75"/>;

    return (
        <SortableCardGrid cards={cards} {...grid} renderCard={(quote) =>
            <QuoteCard quote={quote} handleLinkClicked={props.handleLinkClicked}/>
        }/>
    );
}
