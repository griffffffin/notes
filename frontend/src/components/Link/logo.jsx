import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme";

export default function Logo(props) {
    const {color} = useTheme();

    return (
        <Link to="/" className="no-focus" onClick={props.onClick}>
            <div className={"display-5 logo text-" + color}>To-do</div>
        </Link>
    );
}
