import {Link} from "react-router-dom";
import {renderBold} from "../Quote/bold";

/* A kártya idézet-szövege, ami a szerkesztőre visz — a to-do LinkTodoUpdate
   párja, ezért VALÓDI link (állapotsor, új lapon megnyitás, képernyőolvasó). A
   húzással a rács kattintás-elnyelője (useSortableCards) békíti össze: a húzás
   végi kattintást elnyeli, így az átrendezés nem navigál. */
export default function LinkQuoteUpdate(props) {
    return (
        <Link to={"/quotes/update/" + encodeURIComponent(props.quote._id)} onClick={props.handleLinkClicked}
              className="text-decoration-none">
            {/* pre-wrap: a mentett sortöréseket megtartja (több soros idézet több
                sorban), a hosszú sorokat viszont tördeli. A `**…**` markert a
                renderBold félkövérré alakítja (a szerkesztőben nyersen látszik). */}
            <div className={"card-body caveat text-" + props.color} style={{whiteSpace: "pre-wrap"}}>
                {renderBold(props.quote.quote)}
            </div>
        </Link>
    );
}
