import {useCallback} from "react";
import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import Category from "./category";
import {useTheme} from "../../contexts/theme";
import {useAuth} from "../../contexts/auth";

export default function ColorCategoryAndSignOut(props) {
    const {color} = useTheme();
    const {logout} = useAuth();

    const handleSignOut = useCallback(() => {
        props.handleLinkClicked();
        logout();
    }, [props, logout]);

    return (<>
        {/* A szín- és kategória-választó CSAK a to-dóé (showColorCategory); az
            idézetek navbarjában nincs, csak a kijelentkezés marad. */}
        {props.showColorCategory && <>
            <NoFocusButton onClick={props.handleColorClick} class="pe-2"
                           text={<FontAwesomeIcon className={"py-1 pe-sm-3 text-" + color} size="xl"
                                                  icon={props.isColorClicked ? "fa-solid fa-fill-drip" :
                                                      "fa-solid fa-fill"}/>}/>
            <Category onClick={props.handleCategoryClick} isClicked={props.isCategoryClicked}/>
        </>}
        <FontAwesomeIcon role="button" icon="fa-solid fa-right-from-bracket" size="xl" onClick={handleSignOut}
                         className={"py-1 pe-2 ps-sm-2 text-" + color}/>
    </>);
}
