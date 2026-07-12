import {Link} from "react-router-dom";

export default function Logo(props) {
    return (
        <Link to="/" className="no-focus" onClick={props.onClick}>
            <div className={"display-5 logo text-" + props.color}>To-do</div>
        </Link>
    );
}
