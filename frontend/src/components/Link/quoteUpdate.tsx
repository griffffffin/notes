import type {MouseEventHandler} from "react";
import {Link} from "react-router-dom";
import {renderBold} from "../Quotes/bold";
import type {BootstrapColor} from "../../contexts/theme-context";
import type {Quote} from "../../types/api";

/* A kártya idézet-szövege, ami a szerkesztőre visz — a to-do LinkTodoUpdate
   párja, ezért VALÓDI link (állapotsor, új lapon megnyitás, képernyőolvasó). A
   húzással a rács kattintás-elnyelője (useSortableCards) békíti össze: a húzás
   végi kattintást elnyeli, így az átrendezés nem navigál. */
type LinkQuoteUpdateProps = {
    quote: Quote;
    color: BootstrapColor;
    handleLinkClicked: MouseEventHandler<HTMLAnchorElement>;
};

export default function LinkQuoteUpdate(props: LinkQuoteUpdateProps) {
    return (
        <Link to={"/quotes/update/" + encodeURIComponent(props.quote._id)} onClick={props.handleLinkClicked}
              className="text-decoration-none">
            {/* pre-wrap: a mentett sortöréseket megtartja (több soros idézet több
                sorban), a hosszú sorokat viszont tördeli. A `**…**` markert a
                renderBold félkövérré alakítja (a szerkesztőben nyersen látszik). */}
            {/* --quote-fs: a per-idézet betűméret (l. Quotes/save.jsx Betűméret-stepper);
                a .caveat szabály ebből rajzol, hiányában a Szerző-mérettel egyező 155%.
                textAlign: justify — sorkizárt, mint a szerkesztőben és a publikus nézetben. */}
            <div className={"card-body caveat text-" + props.color}
                 style={{"--quote-fs": (props.quote.fontSize ?? 155) + "%", whiteSpace: "pre-wrap",
                     textAlign: "justify"}}>
                {renderBold(props.quote.quote)}
            </div>
        </Link>
    );
}
