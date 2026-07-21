import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* Egy szerző-hivatkozás az idézet-kártya láblécén — a to-do LinkCategory párja:
   a szerző szűrt nézetére visz (/quotes/:author). Az encodeURIComponent a
   szóközt/ékezetet kódolja, hogy a szerzőnév ne törje szét az útvonalat; a
   QuoteRead a :author-t dekódolva kapja vissza.

   NÉVTELEN idézetnek NINCS lábléce: az "Anonymous" jelölő CSAK az URL-ben létezik
   (a /quotes/Anonymous szűrő szegmenseként), a felületen sehol nem írjuk ki — így
   a kártya olyan, mint a publikus nézet: szerző csak akkor látszik, ha van.

   Valódi link (nem kattintás-kezelős doboz): a böngésző így ismeri fel
   célpontnak (állapotsor, új lapon megnyitás), a képernyőolvasó linkként hirdeti.
   A d-block kell: az <a> alapból inline, a lábléc keretét blokként veszi fel. */
export default function LinkAuthor(props) {
    const {color} = useTheme();

    if (!props.author) return null;

    return (
        <Link to={"/quotes/" + encodeURIComponent(props.author)} onClick={props.onClick}
              className={props.class + " d-block text-decoration-none text-" + (props.color ?? color)}>
            {props.author}
        </Link>
    );
}
