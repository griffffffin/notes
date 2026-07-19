import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* Egy kategória-hivatkozás. KÉT helyen jelenik meg: a to-do kártya láblécében
   ÉS a navbar kategória-legördülőjében.

   A színt a téma adja, KIVÉVE ha a hívó felülírja (props.color) — a to-do
   kártyák lábléce a saját to-do színét használja, nem a témáét.

   Valódi link, nem kattintás-kezelős doboz: a böngésző így ismeri fel
   célpontnak (állapotsor, középső gombos "új lapon megnyitás", jobb gombos
   menü), a képernyőolvasó pedig linkként hirdeti ki. Ez egyben elhagyhatóvá
   teszi a kézzel adott role="button"-t, a tabIndexet és a billentyűkezelést:
   azt mind ingyen hozza a linkség.

   A kártya láblécén a húzással a rács kattintás-elnyelője békíti össze
   (read.jsx): a felengedéskor érkező kattintást elnyeli, ha közben húzás
   történt, így a lista átrendezése nem navigál el. A navbarban ez nem fenyeget,
   mert ott nincs húzás.

   A d-block kell: az <a> alapból inline, a lábléc keretét és térközeit viszont
   csak blokként veszi fel rendesen. */
export default function Category(props) {
    const {color} = useTheme();

    return (
        /* A szűrő az URL-ben utazik (/category/:name): MELYIK kategóriát kérje le
           a lista. Így F5/direkt link után is áll — szemben a régi navigációs
           state-tel. Az encodeURIComponent a szóközt/ékezetet/perjelet kódolja,
           hogy a kategórianév ne törje szét az útvonalat; a Read a :name-et már
           dekódolva kapja vissza. */
        <Link to={"/to-do/category/" + encodeURIComponent(props.category)} onClick={props.onClick}
              className={props.class + " d-block text-decoration-none text-" + (props.color ?? color)}>
            {props.category}
        </Link>
    );
}
