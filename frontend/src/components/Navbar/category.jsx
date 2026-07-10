import {useEffect, useState} from "react";
import Spinner from "../spinner";
import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";

export default function Category(props) {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (props.color) setIsLoading(false);
    }, [props.color]);

    return (
        isLoading ? <Spinner/> :
            <>
                <div role="button" className={"pb-1 user-select-none caveat text-" + props.color}
                     onClick={props.onClick}>
                    Kategória
                </div>
                <NoFocusButton onClick={props.onClick} class="pb-1" text={props.isClicked ?
                    <FontAwesomeIcon icon="fa-solid fa-angle-up" size="xl" className={"text-" + props.color}/> :
                    <FontAwesomeIcon icon="fa-solid fa-angle-down" size="xl" className={"text-" + props.color}/>}/>
            </>
    );
}
