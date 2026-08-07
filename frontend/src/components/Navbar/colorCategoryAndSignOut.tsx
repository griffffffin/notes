import {useCallback} from "react";
import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import Category, {type NavbarCategoryProps} from "./category";
import {useTheme} from "../../contexts/theme-context";
import {useAuth} from "../../contexts/auth-context";

type ColorCategoryAndSignOutProps = {
    handleLinkClicked: () => void;
    handleColorClick: () => void;
    isColorClicked: boolean;
    handleCategoryClick: NavbarCategoryProps["onClick"];
    isCategoryClicked: NavbarCategoryProps["isClicked"];
    /* Csak a to-do szekcióban igaz: a szín- és kategória-szűrő a to-do sajátja. */
    showColorCategory: boolean;
};

export default function ColorCategoryAndSignOut(props: ColorCategoryAndSignOutProps) {
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
                                                  icon={props.isColorClicked ? ["fas", "fill-drip"] :
                                                      ["fas", "fill"]}/>}/>
            <Category onClick={props.handleCategoryClick} isClicked={props.isCategoryClicked}/>
        </>}
        <FontAwesomeIcon role="button" icon={["fas", "right-from-bracket"]} size="xl" onClick={handleSignOut}
                         className={"py-1 pe-2 ps-sm-2 text-" + color}/>
    </>);
}
