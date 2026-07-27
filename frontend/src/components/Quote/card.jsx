import LinkQuoteUpdate from "../Link/quoteUpdate";
import LinkAuthor from "../Link/author";
import {useTheme} from "../../contexts/theme-context";

/* Egy idézet-kártya tartalma: felül az idézet szövege (a szerkesztőre visz),
   alul a szerző lábléce (a szerző-szűrt nézetre visz). KÖZÖS a teljes lista
   (QuoteRead) és a keresési találat (QuoteSearchResults) között — a kártya
   kinézete egy helyen él, nem duplázódik a két nézetben.

   Az idézetnek nincs saját színe (a to-do color-választója itt nincs), ezért a
   kártya a TÉMA színét viseli: a keret, a szöveg és a lábléc is. */
export default function QuoteCard({quote, handleLinkClicked}) {
    const {color} = useTheme();

    return (
        <div className={"card bg-transparent border-2 border-" + color}>
            <LinkQuoteUpdate quote={quote} color={color} handleLinkClicked={handleLinkClicked}/>
            <LinkAuthor author={quote.author} color={color} onClick={handleLinkClicked}
                        class={"card-footer small text-center bg-transparent mx-2 border-" + color}/>
        </div>
    );
}
