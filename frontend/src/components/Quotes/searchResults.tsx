import type {MouseEventHandler} from "react";
import {useMemo} from "react";
import {useParams} from "react-router-dom";
import QuoteCard from "./card";
import {useSectionList} from "../CardList/useSectionList";
import CardListView from "../CardList/CardListView";
import type {Quote} from "../../types/api";

type QuoteSearchResultsProps = {
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* A keresés SZÖVEG-módjának találati nézete (/quotes/search/:term): azok az
   idézetek, amelyekben a keresett kifejezés a szövegben VAGY a szerzőben
   előfordul (a backend /quotes/search adja, csupasz tömbként).

   A lista + húzás gépezetét a szerző-szűrt nézettel AZONOS módon használja
   (useSectionList + CardListView, /quotes/reorder): a találat PONTOSAN úgy
   rendezhető át, mint egy szerző alatt — ugyanaz a globális sorszám, ugyanaz a
   reprodukálható relatív sorrend (l. a döntést a húzhatóságról). A kártya a
   KÖZÖS QuoteCard.

   ELTÉRÉS a lista-nézetektől: az üres találat MINDIG visszairányít a teljes
   listára (nem csak szűrt nézetben, mint a QuoteRead-nél) — a keresés eleve szűrt
   nézet, "üres keresés" mint önálló felület nem létezik.

   A szekció akcentusát ez a nézet SZÁNDÉKOSAN nem állítja: a keresési találat a
   piros szűrt-nézet-színt a QuoteRead-től eltérően nem viseli (l. useQuoteAccent). */
export default function QuoteSearchResults(props: QuoteSearchResultsProps) {
    const {term} = useParams();

    // A useParams a route-paramétert MÁR dekódolva adja (mint a szerzőnél) —
    // nem kell újra decodeURIComponent, az kétszeres dekódolás lenne.
    const filter = useMemo(() => ({term}), [term]);

    const {cards, isLoading, grid} = useSectionList<Quote>({
        url: "/quotes/search", filter, reorderUrl: "/quotes/reorder", section: "/quotes",
    });

    return (
        <CardListView cards={cards} isLoading={isLoading} grid={grid} emptyRedirect="/quotes"
                      renderCard={(quote) =>
                          <QuoteCard quote={quote} handleLinkClicked={props.handleLinkClicked}/>}/>
    );
}
