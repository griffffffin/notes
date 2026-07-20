import {Link} from "react-router-dom";

/* A kártya idézet-szövege, ami a szerkesztőre visz — a to-do LinkTodoUpdate
   párja, ezért VALÓDI link (állapotsor, új lapon megnyitás, képernyőolvasó). A
   húzással a rács kattintás-elnyelője (useSortableCards) békíti össze: a húzás
   végi kattintást elnyeli, így az átrendezés nem navigál. */
export default function LinkQuoteUpdate(props) {
    return (
        <Link to={"/quotes/update/" + encodeURIComponent(props.quote._id)} onClick={props.handleLinkClicked}
              className="text-decoration-none">
            <div className={"card-body caveat text-" + props.color}>
                {props.quote.quote}
            </div>
        </Link>
    );
}
