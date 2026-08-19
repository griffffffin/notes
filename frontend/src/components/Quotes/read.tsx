import type {MouseEventHandler} from "react";
import {useMemo} from "react";
import {useParams} from "react-router-dom";
import QuoteCard from "./card";
import {useQuoteAccent} from "./useQuoteAccent";
import {useSectionList} from "../CardList/useSectionList";
import CardListView from "../CardList/CardListView";
import {ENDPOINTS} from "../../endpoints";
import type {Endpoint} from "../../endpoints";
import {quoteListSchema} from "../../types/api";
import type {Quote} from "../../types/api";
import {PATHS} from "../../paths";

/* A `url` a lista végpontját adja: a teljes lista vagy a szerző-szűrt — a route
   dönti el, melyikkel hív. A szűrő-mód is ebből számol (l. `needsFilter`). */
type QuoteReadProps = {
    url: Endpoint;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* Az idézet-lista. A betöltés + húzás + szekció-emlékezet a useSectionList
   hookban, a megjelenítés a CardListView-ban van (ugyanaz, mint a to-dónál); itt
   csak az idézet-SPECIFIKUS rész marad: a szerző-szűrő és a szekció akcentusa. A
   kártya TARTALMA a KÖZÖS QuoteCard (a keresési találat is ezt használja). */
export default function QuoteRead(props: QuoteReadProps) {
    const {author} = useParams();

    const needsFilter = props.url === ENDPOINTS.quotesByAuthor;
    /* A "névtelen" idézeteket a URL-ben "Anonymous" jelöli (üres szerző nem lehet
       URL-szegmens); a szervernek viszont üres stringgel szűrünk rájuk. A csupasz
       /quotes (:author nélkül) nem ide, hanem a szűretlen listára jut, a szűrt
       nézetet pedig a route :author paramétere garantálja — külön őr itt nem kell. */
    const filter = useMemo(
        () => (author != null ? {author: author === "Anonymous" ? "" : author} : null),
        [author],
    );

    const {cards, isLoading, loadFailed, reload, grid} = useSectionList<Quote>({
        url: props.url, filter, reorderUrl: ENDPOINTS.quoteReorder, section: PATHS.quotes,
        schema: quoteListSchema,
    });

    /* A szekció akcentusa (l. useQuoteAccent): a quotes-lista VILÁGOS témán tinta-kék,
       sötéten a globális sárga. A szerző-szűrt nézet PIROSSAL üti felül — de CSAK ha VAN
       találat: egy üres szűrt nézet (pl. /quotes/search → nincs "search" nevű szerző)
       amúgy is visszairányít a főlistára, és a piros megvillanna az ugrás előtt. A
       `hasFilteredResults` BOOLEAN (nem a cards identitása), így a húzás-átrendezés
       (cards-mutáció) nem billegteti a színt.

       ELTÉRÉS a to-do listától: ez az egyetlen ok, amiért a `cards` itt a nézetben
       is kell, nem elég a CardListView-nak átadni — a szekció színe a találatok
       meglététől függ. */
    const hasFilteredResults = needsFilter && Array.isArray(cards) && cards.length > 0;
    useQuoteAccent(hasFilteredResults);

    // Üres SZŰRT nézet (az utolsó ilyen szerzőjű idézetet átírták/törölték) —
    // vissza a teljes listára. A teljes lista LEGITIMEN lehet üres.
    return (
        <CardListView cards={cards} isLoading={isLoading} loadFailed={loadFailed} onRetry={reload} grid={grid}
                      emptyRedirect={needsFilter ? PATHS.quotes : null}
                      renderCard={(quote) =>
                          <QuoteCard quote={quote} handleLinkClicked={props.handleLinkClicked}/>}/>
    );
}
