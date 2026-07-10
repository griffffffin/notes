import {Link} from "react-router-dom";

export default function Category(props) {
    return (
        <Link to="/category" className={props.class + " text-decoration-none text-" + props.color}
              state={{user: props.cookies.user, category: props.category}} onClick={props.onClick}>
            {props.category}
        </Link>
    );
}
