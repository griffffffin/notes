import type {MouseEventHandler} from "react";
import {Link} from "react-router-dom";
import {renderBold} from "../Quotes/bold";
import type {BootstrapColor} from "../../contexts/theme-context";
import {PATHS} from "../../paths";

/* A kártya idézet-szövege, ami a szerkesztőre visz — a to-do LinkTodoUpdate
   párja, ezért VALÓDI link (állapotsor, új lapon megnyitás, képernyőolvasó). A
   húzással a rács kattintás-elnyelője (useSortableCards) békíti össze: a húzás
   végi kattintást elnyeli, így az átrendezés nem navigál.

   VÉGPONTOK KÖZÖTTI TITKOSÍTÁS (E2EE): a szöveget és a betűméretet MÁR NEM a
   szerver-oldali `Quote`-ból veszi (ott csak a titkosított boríték van), hanem a
   hívó (card.tsx) adja át, MÁR VISSZAFEJTVE. Az `id` a szerkesztő-link címéhez kell. */
type LinkQuoteUpdateProps = {
    id: string;
    // A visszafejtett idézet-szöveg (a `**…**` markert a renderBold félkövéríti).
    text: string;
    // A per-idézet betűméret SZÁZALÉKBAN (a blobból); hiányában a Szerző-mérettel egyező 155%.
    fontSize: number;
    color: BootstrapColor;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

export default function LinkQuoteUpdate(props: LinkQuoteUpdateProps) {
    return (
        <Link to={PATHS.quoteUpdate(props.id)} onClick={props.handleLinkClicked}
              className="text-decoration-none">
            {/* pre-wrap: a mentett sortöréseket megtartja (több soros idézet több
                sorban), a hosszú sorokat viszont tördeli. A `**…**` markert a
                renderBold félkövérré alakítja (a szerkesztőben nyersen látszik). */}
            {/* --quote-fs: a per-idézet betűméret (l. Quotes/save.tsx Betűméret-stepper);
                a .caveat szabály ebből rajzol. textAlign: justify — sorkizárt, mint a
                szerkesztőben. */}
            <div className={"card-body caveat text-" + props.color}
                 style={{"--quote-fs": props.fontSize + "%", whiteSpace: "pre-wrap",
                     textAlign: "justify"}}>
                {renderBold(props.text)}
            </div>
        </Link>
    );
}
