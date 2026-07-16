import {useNavigate} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* A színt a téma adja, KIVÉVE ha a hívó felülírja (props.color) — a to-do
   kártyák lábléce a saját to-do színét használja, nem a témáét.

   KÉT helyen jelenik meg: a to-do kártya láblécében ÉS a navbar kategória-
   legördülőjében.

   Nincs benne <a> elem, ugyanazért, amiért a todoUpdate.jsx-ben sincs: a
   kártya láblécén egy horgony a böngésző beépített link-húzásával és
   alapértelmezett navigációjával keresztezné a húzást — teljes oldalbetöltést
   indítva a /category-re, navigációs state (a szűrő) nélkül, ahonnan a Read őre
   visszadob a főoldalra.

   A navbarban ez nem fenyeget (ott nincs húzás), de a két megjelenést nem
   éri meg szétszedni egyetlen elemtípusért. Ára: a középső gombos "új lapon
   megnyitás" itt is elmarad — az URL-alapú útvonalakkal (/category/:name) jön
   vissza, a kategória-bővítéskor. */
export default function Category(props) {
    const {color} = useTheme();
    const navigate = useNavigate();

    const handleClick = () => {
        if (props.onClick) props.onClick();
        navigate("/category", {state: {category: props.category}});
    };

    /* role="button" + tabIndex + billentyűkezelés: a navbar legördülőjében ennek
       az elemnek NINCS gomb-szerepű szülője (a kártyán a SortableCard az), tehát
       magának kell kihirdetnie, hogy kattintható — különben a billentyűzettel
       navigálók számára láthatatlan marad. */
    const handleKeyDown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
        }
    };

    return (
        <div onClick={handleClick} onKeyDown={handleKeyDown} role="button" tabIndex={0}
             className={props.class + " text-decoration-none text-" + (props.color ?? color)}>
            {props.category}
        </div>
    );
}
