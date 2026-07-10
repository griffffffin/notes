import {useEffect, useState} from "react";
import Spinner from "../spinner";
import {Link} from "react-router-dom";

export default function Logo(props) {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (props.color) setIsLoading(false);
    }, [props.color]);

    return (
        isLoading ? <Spinner/> :
            <Link to="/" className="no-focus" onClick={props.onClick}>
                <div className={"display-5 logo text-" + props.color}>To-do</div>
            </Link>
    );
}
