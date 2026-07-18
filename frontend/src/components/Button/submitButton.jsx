export default function SubmitButton(props) {
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
