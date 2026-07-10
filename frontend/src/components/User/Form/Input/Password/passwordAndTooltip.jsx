import Tooltip from "../../tooltip";
import RoundedPillInput from "../../../../Input/roundedPillInput";
import NoFocusButton from "../../../../Button/noFocusButton";
import eye from "../../../../../assets/icons/password/eye_of_providence.svg";

export default function PasswordAndTooltip(props) {
    return (<>
        <label htmlFor="inputPassword" className="form-label ps-3 pe-1">Jelszó</label>

        {!props.isLogin && <Tooltip color={props.color} colorHex={props.colorHex}
                                    backgroundColor={props.backgroundColor}/>}

        <div className="input-group justify-content-end">
            <RoundedPillInput type={props.isVisible ? "text" : "password"} id="inputPassword" value={props.value}
                              onChange={props.handleChange} autoFocus={false}
                              class={props.isChecked ? "bg-secondary bg-opacity-10" : "warning-focus"}/>
            <NoFocusButton onClick={props.handleClick} class="position-absolute z-index-3 pt-0 pe-0"
                           text={<img src={eye} width="42" height="45" alt=""/>}/>
        </div>
    </>);
}
