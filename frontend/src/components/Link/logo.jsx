import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

export default function Logo(props) {
    const {color} = useTheme();

    return (
        /* text-decoration-none: a böngésző alapból aláhúzza a linkeket, a logó
           viszont felirat, nem szövegközi hivatkozás. */
        <Link to="/" className="no-focus text-decoration-none" onClick={props.onClick}>
            <div className={"display-5 logo text-" + color}>To-do</div>
        </Link>
    );
}
