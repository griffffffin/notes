import type {MouseEventHandler} from "react";
import QuoteCard from "./card";
import {useQuoteAccent} from "./useQuoteAccent";
import {useSectionList} from "../CardList/useSectionList";
import CardListView from "../CardList/CardListView";
import {ENDPOINTS} from "../../endpoints";
import {quoteListSchema} from "../../types/api";
import type {Quote} from "../../types/api";
import {PATHS} from "../../paths";

type QuoteReadProps = {
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* Az idézet-lista. A betöltés + húzás + szekció-emlékezet a useSectionList
   hookban, a megjelenítés a CardListView-ban van (ugyanaz, mint a to-dónál); itt
   csak az idézet-SPECIFIKUS rész marad: a szekció akcentusa és a titkosított
   kártya (QuoteCard fejti vissza a tartalmat).

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE) UTÁN a szerver-oldali szerző-szűrés MEGSZŰNT
   (a titkosított tartalomra a szerver nem tud szűrni) — ezért nincs többé `url`/`filter`
   prop, sem `/quotes/:author` nézet, sem piros „szűrt nézet" akcentus. A kliens-oldali
   keresés/szűrés F3-ban jön; addig ez a teljes, egyetlen lista. */
export default function QuoteRead(props: QuoteReadProps) {
    // A szekció akcentusa: a quotes-lista VILÁGOS témán tinta-kék, sötéten a globális sárga.
    useQuoteAccent();

    const {cards, isLoading, loadFailed, reload, grid} = useSectionList<Quote>({
        url: ENDPOINTS.quotes, reorderUrl: ENDPOINTS.quoteReorder, section: PATHS.quotes,
        schema: quoteListSchema,
    });

    return (
        <CardListView cards={cards} isLoading={isLoading} loadFailed={loadFailed} onRetry={reload} grid={grid}
                      emptyRedirect={null}
                      renderCard={(quote) =>
                          <QuoteCard quote={quote} handleLinkClicked={props.handleLinkClicked}/>}/>
    );
}
