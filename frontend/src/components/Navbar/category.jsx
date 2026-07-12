import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTheme} from "../../contexts/theme";

export default function Category(props) {
    const {color} = useTheme();

    return (
        <>
            <div role="button" className={"pb-1 user-select-none caveat text-" + color}
                 onClick={props.onClick}>
                Kategória
            </div>
            <NoFocusButton onClick={props.onClick} class="pb-1" text={props.isClicked ?
                <FontAwesomeIcon icon="fa-solid fa-angle-up" size="xl" className={"text-" + color}/> :
                <FontAwesomeIcon icon="fa-solid fa-angle-down" size="xl" className={"text-" + color}/>}/>
        </>);
}
