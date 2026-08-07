import type {MouseEventHandler} from "react";
import type {BootstrapColor} from "../../contexts/theme-context";

type SubmitButtonProps = {
    type?: "submit" | "button";
    onClick?: MouseEventHandler<HTMLButtonElement>;
    isDisabled: boolean;
    isOutline: boolean;
    /* Kétféle szín kerülhet ide: a téma sajátja (a belépő és a mentő űrlapok
       gombjai) vagy a to-do paletta egy neve (a kártya-szerkesztő, és a törlés-
       modal piros gombja). */
    color: BootstrapColor;
    text: string;
};

export default function SubmitButton(props: SubmitButtonProps) {
    return (
        // A type alapból "submit" (belépő/mentő űrlapok), de felülírható: a
        // törlés-modal gombjai "button"-ok, különben a körülvevő Save-űrlapot is
        // elsütnék — az idézne elő egy versenyt (a lista a törlés BEFEJEZÉSE
        // előtt töltene újra), amitől a törölt to-do "szelleme" bent ragadt.
        <button type={props.type ?? "submit"} onClick={props.onClick} disabled={props.isDisabled}
                className={props.isOutline ? "btn rounded-pill w-100 btn-outline-" + props.color :
                    "btn rounded-pill my-1 btn-" + props.color}>
            {props.text}
        </button>
    );
}
