import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

/* A színt a téma adja, KIVÉVE ha a hívó felülírja (props.color) — a to-do
   kártyák lábléce a saját to-do színét használja, nem a témáét. */
export default function Category(props) {
    const {color} = useTheme();

    return (
        <Link to="/category" className={props.class + " text-decoration-none text-" + (props.color ?? color)}
              state={{user: props.cookies.user, category: props.category}} onClick={props.onClick}>
            {props.category}
        </Link>
    );
}
