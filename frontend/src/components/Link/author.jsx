import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* Egy szerző-hivatkozás az idézet-kártya láblécén — a to-do LinkCategory párja:
   a szerző szűrt nézetére visz (/quotes/:author). A névtelen idézet szerzője a
   URL-ben és a feliraton is "Anonymous" (üres szegmens nem lehet URL-ben). Az
   encodeURIComponent a szóközt/ékezetet kódolja, hogy a szerzőnév ne törje szét
   az útvonalat; a QuoteRead a :author-t dekódolva kapja vissza.

   Valódi link (nem kattintás-kezelős doboz): a böngésző így ismeri fel
   célpontnak (állapotsor, új lapon megnyitás), a képernyőolvasó linkként hirdeti.
   A d-block kell: az <a> alapból inline, a lábléc keretét blokként veszi fel. */
export default function LinkAuthor(props) {
    const {color} = useTheme();
    const label = props.author || "Anonymous";

    return (
        <Link to={"/quotes/" + encodeURIComponent(label)} onClick={props.onClick}
              className={props.class + " d-block text-decoration-none text-" + (props.color ?? color)}>
            {label}
        </Link>
    );
}
