import type {MouseEventHandler} from "react";
import LinkQuoteUpdate from "../Link/quoteUpdate";
import LinkAuthor from "../Link/author";
import {useTheme} from "../../contexts/theme-context";
import type {Quote} from "../../types/api";

/* A `handleLinkClicked` KÉT link-fejre megy (a szöveg és a szerző-lábléc), mindkettő
   horgonyt renderel — ezért horgony-kattintás kezelője. A húzás végi kattintást a
   rács nyeli el (l. useSortableCards), így az átrendezés nem navigál. */
type QuoteCardProps = {
    quote: Quote;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* Egy idézet-kártya tartalma: felül az idézet szövege (a szerkesztőre visz),
   alul a szerző lábléce (a szerző-szűrt nézetre visz). KÖZÖS a teljes lista
   (QuoteRead) és a keresési találat (QuoteSearchResults) között — a kártya
   kinézete egy helyen él, nem duplázódik a két nézetben.

   Az idézetnek nincs saját színe (a to-do color-választója itt nincs), ezért a
   kártya a TÉMA színét viseli: a keret, a szöveg és a lábléc is. */
export default function QuoteCard({quote, handleLinkClicked}: QuoteCardProps) {
    const {color} = useTheme();

    return (
        <div className={"card bg-transparent border-2 border-" + color}>
            <LinkQuoteUpdate quote={quote} color={color} handleLinkClicked={handleLinkClicked}/>
            <LinkAuthor author={quote.author} color={color} onClick={handleLinkClicked}
                        class={"card-footer small text-center bg-transparent mx-2 border-" + color}/>
        </div>
    );
}
