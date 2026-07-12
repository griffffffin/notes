import Tooltip from "../../tooltip";
import RoundedPillInput from "../../../../Input/roundedPillInput";
import NoFocusButton from "../../../../Button/noFocusButton";
import openEye from "../../../../../assets/icons/password/eye_of_providence.svg";
import closedEye from "../../../../../assets/icons/password/closed_eye.svg";

export default function PasswordAndTooltip(props) {
    return (<>
        <label htmlFor="inputPassword" className="form-label ps-3 pe-1">Jelszó</label>

        {!props.isLogin && <Tooltip color={props.color} colorHex={props.colorHex}
                                    backgroundColor={props.backgroundColor}/>}

        <div className="input-group justify-content-end">
            <RoundedPillInput type={props.isVisible ? "text" : "password"} id="inputPassword" value={props.value}
                              onChange={props.handleChange} autoFocus={false}
                              class={props.isChecked ? "bg-secondary bg-opacity-10" : "warning-focus"}/>
            {/* Rejtett jelszónál csukott szem, láthatónál a nyitott — az ikon azt
                mutatja, mi az AKTUÁLIS állapot, nem azt, mi történik kattintásra. */}
            <NoFocusButton onClick={props.handleClick} class="position-absolute z-index-6 pt-0 pe-0"
                           text={<img src={props.isVisible ? openEye : closedEye} width="42" height="45"
                                      alt={props.isVisible ? "Jelszó elrejtése" : "Jelszó megjelenítése"}/>}/>
        </div>
    </>);
}
