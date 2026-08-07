import NoFocusButton from "../Button/noFocusButton";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {useTheme} from "../../contexts/theme-context";

/* A navbar "Kategória" felirata a legördülő nyilával. A felirat és a nyíl UGYANAZT
   a kezelőt kapja, hogy a szövegre kattintás is nyisson/csukjon. */
export type NavbarCategoryProps = {
    onClick: () => void;
    /* Nyitva van-e a legördülő — csak a nyíl irányát dönti el (fel/le). */
    isClicked: boolean;
};

export default function Category(props: NavbarCategoryProps) {
    const {color} = useTheme();

    return (
        <>
            <div role="button" className={"pb-1 user-select-none caveat text-" + color}
                 onClick={props.onClick}>
                Kategória
            </div>
            <NoFocusButton onClick={props.onClick} class="pb-1" text={props.isClicked ?
                <FontAwesomeIcon icon={["fas", "angle-up"]} size="xl" className={"text-" + color}/> :
                <FontAwesomeIcon icon={["fas", "angle-down"]} size="xl" className={"text-" + color}/>}/>
        </>);
}
