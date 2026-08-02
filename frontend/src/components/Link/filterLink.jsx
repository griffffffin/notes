import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme-context";

/* Egy SZŰRT NÉZETRE mutató hivatkozás — a szekciók közös váza. Ma a to-do
   kategóriája (/to-dos/category/:name) és az idézet szerzője (/quotes/:author)
   használja; a következő szekció (film: műfaj) ugyanezt kapja.

   Miért VALÓDI link, és nem kattintás-kezelős doboz? Mert a böngésző így ismeri
   fel célpontnak: látszik a cím az állapotsorban, működik a középső gombos "új
   lapon megnyitás" és a jobb gombos menü, a képernyőolvasó pedig linkként hirdeti
   ki. Ez egyben elhagyhatóvá teszi a kézzel adott role="button"-t, a tabIndexet
   és a billentyűkezelést: azt mind ingyen hozza a linkség.

   Az encodeURIComponent a szóközt/ékezetet/perjelet kódolja, hogy az érték ne
   törje szét az útvonalat; a fogadó nézet a route-paramétert már dekódolva kapja
   (useParams), tehát ott nem kell — és nem is szabad — újra dekódolni.

   A színt a téma adja, KIVÉVE ha a hívó felülírja (color): a to-do kártyák
   lábléce a saját to-do színét viseli, nem a témáét.

   A d-block kell: az <a> alapból inline, a lábléc keretét és térközeit viszont
   csak blokként veszi fel rendesen.

   A kártya láblécén a húzással a rács kattintás-elnyelője békíti össze
   (useSortableCards): a felengedéskor érkező kattintást elnyeli, ha közben húzás
   történt, így a lista átrendezése nem navigál el. A navbarban ez nem fenyeget,
   mert ott nincs húzás. */
export default function FilterLink({to, value, onClick, color, class: className}) {
    const theme = useTheme();

    return (
        <Link to={to + encodeURIComponent(value)} onClick={onClick}
              className={className + " d-block text-decoration-none text-" + (color ?? theme.color)}>
            {value}
        </Link>
    );
}
