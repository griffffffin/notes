import {useCallback} from "react";
import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import Category from "./category";
import {useTheme} from "../../contexts/theme";

export default function ColorCategoryAndSignOut(props) {
    const {color} = useTheme();

    const handleSignOut = useCallback(() => {
        props.handleLinkClicked();
        props.removeCookie("user");
    }, [props]);

    return (<>
        <NoFocusButton onClick={props.handleColorClick} class="pe-2"
                       text={<FontAwesomeIcon className={"py-1 pe-sm-3 text-" + color} size="xl"
                                              icon={props.isColorClicked ? "fa-solid fa-fill-drip" :
                                                  "fa-solid fa-fill"}/>}/>
        <Category onClick={props.handleCategoryClick} isClicked={props.isCategoryClicked}/>
        <FontAwesomeIcon role="button" icon="fa-solid fa-right-from-bracket" size="xl" onClick={handleSignOut}
                         className={"py-1 pe-2 ps-sm-2 text-" + color}/>
    </>);
}
