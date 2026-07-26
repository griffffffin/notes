import RoundedPillInput from "../../../../Input/roundedPillInput";
import NoFocusButton from "../../../../Button/noFocusButton";
import closedEye from "../../../../../assets/icons/password/closed_eye.svg";
import openEye from "../../../../../assets/icons/password/eye_of_providence.svg";
import {useTheme} from "../../../../../contexts/theme-context";

/* Mindkét szem importált asset: a Vite a bundle-be ágyazza őket (a küszöb
   8 kB, lásd vite.config.js), így nincs értük külön letöltés, és nem villannak
   be későn. A nyitott szem svgo-val 24 kB → 6,4 kB lett. */

export default function PasswordConfirm(props) {
    const {isChecked} = useTheme();

    return (<>
        <label htmlFor="inputPasswordConfirm" className="form-label pt-1 ps-3">Jelszó megerősítése</label>
        <div className="input-group justify-content-end">
            <RoundedPillInput type={props.isVisible ? "text" : "password"} id="inputPasswordConfirm" value={props.value}
                              onChange={props.onChange} autoFocus={false}
                              class={isChecked ? "bg-secondary bg-opacity-10" : "theme-focus"}/>
            <NoFocusButton onClick={props.onClick} class="position-absolute z-index-6 pt-0 pe-0"
                           text={<img src={props.isVisible ? openEye : closedEye} width="42" height="45"
                                      alt={props.isVisible ? "Jelszó elrejtése" : "Jelszó megjelenítése"}/>}/>
        </div>
    </>);
}
