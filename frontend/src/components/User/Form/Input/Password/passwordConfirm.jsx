import RoundedPillInput from "../../../../Input/roundedPillInput";
import NoFocusButton from "../../../../Button/noFocusButton";
import closedEye from "../../../../../assets/icons/password/closed_eye.svg";

/* A nyitott szem (24 KB) a public/ mappából jön, stabil útvonalon, hogy az
   index.html előre betölthesse — importálva külön, késve érkező fájl lenne.
   A csukott szem 3,4 KB: a Vite beágyazza a bundle-be, ott nincs gond. */
const OPEN_EYE = "/icons/eye_of_providence.svg";

export default function PasswordConfirm(props) {
    return (<>
        <label htmlFor="inputPasswordConfirm" className="form-label pt-1 ps-3">Jelszó megerősítése</label>
        <div className="input-group justify-content-end">
            <RoundedPillInput type={props.isVisible ? "text" : "password"} id="inputPasswordConfirm" value={props.value}
                              onChange={props.onChange} autoFocus={false}
                              class={props.isChecked ? "bg-secondary bg-opacity-10" : "warning-focus"}/>
            <NoFocusButton onClick={props.onClick} class="position-absolute z-index-6 pt-0 pe-0"
                           text={<img src={props.isVisible ? OPEN_EYE : closedEye} width="42" height="45"
                                      alt={props.isVisible ? "Jelszó elrejtése" : "Jelszó megjelenítése"}/>}/>
        </div>
    </>);
}
