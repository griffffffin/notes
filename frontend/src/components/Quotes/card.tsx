import type {MouseEventHandler} from "react";
import {useMemo} from "react";
import LinkQuoteUpdate from "../Link/quoteUpdate";
import {useTheme} from "../../contexts/theme-context";
import type {Quote} from "../../types/api";
import {decryptQuote} from "./quoteContent";

/* A `handleLinkClicked` az idézet-szöveg link-fejére megy (a szerkesztőre visz). A
   húzás végi kattintást a rács nyeli el (l. useSortableCards), így az átrendezés nem navigál. */
type QuoteCardProps = {
    quote: Quote;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

/* Egy idézet-kártya tartalma: felül az idézet szövege (a szerkesztőre visz), alul —
   ha van — a szerző neve. KÖZÖS a lista (QuoteRead) számára; az idézetnek nincs saját
   színe, ezért a kártya a TÉMA színét viseli.

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE): a szerver csak a titkosított borítékot
   (`quote.ciphertext`) adja, a szöveget/szerzőt/betűméretet ITT fejtjük vissza a
   mesterkulccsal (l. quoteContent.ts). A `useMemo` csak az elem VÁLTOZÁSAKOR fejt
   újra — a húzás-átrendezés (a `cards` mutációja) nem érinti a tartalmat, tehát nem
   dolgoztat fölöslegesen.

   ELTÉRÉS a korábbi kártyától (külön szerző-link komponenst használt): a szerző MOST
   SIMA SZÖVEG, nem link. A szerző-szűrt nézet (/quotes/:author) az E2EE-vel megszűnt (a
   szerver titkosított tartalomra nem tud szűrni); a kliens-oldali szűrés F3-ban jön.

   HIBÁS ELEM: ha a boríték nem fejthető vissza (megbuherált blob, séma-eltérés, vagy
   valahogy zárolt kulcs), a `decryptQuote` DOB — ezt ELKAPJUK, és CSAK EZ az egy
   kártya kap hiba-jelzést, a lista többi eleme épen marad (l. E2EE.md 10.). */
export default function QuoteCard({quote, handleLinkClicked}: QuoteCardProps) {
    const {color} = useTheme();

    const content = useMemo(() => {
        try {
            return decryptQuote(quote._id, quote.ciphertext);
        } catch {
            return null;
        }
    }, [quote._id, quote.ciphertext]);

    if (content === null) return (
        <div className={"card bg-transparent border-2 border-" + color}>
            <div className={"card-body small text-center text-" + color} role="alert">
                Ez az idézet nem fejthető vissza.
            </div>
        </div>
    );

    return (
        <div className={"card bg-transparent border-2 border-" + color}>
            <LinkQuoteUpdate id={quote._id} text={content.quote} fontSize={content.fontSize}
                             color={color} handleLinkClicked={handleLinkClicked}/>
            {/* Névtelen idézetnek nincs lábléce — mint korábban (a szerző-link null-t adott
                üres szerzőre). A stílus a régi láblécé, csak most sima szöveg, nem link. */}
            {content.author &&
                <div className={"card-footer small text-center bg-transparent mx-2 border-" + color}>
                    {content.author}
                </div>}
        </div>
    );
}
