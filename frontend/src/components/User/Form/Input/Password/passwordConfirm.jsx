import RoundedPillInput from "../../../../Input/roundedPillInput";
import NoFocusButton from "../../../../Button/noFocusButton";
import eye from "../../../../../assets/icons/password/eye_of_providence.svg";

export default function PasswordConfirm(props) {
    return (<>
        <label htmlFor="inputPasswordConfirm" className="form-label pt-1 ps-3">Jelszó megerősítése</label>
        <div className="input-group justify-content-end">
            <RoundedPillInput type={props.isVisible ? "text" : "password"} id="inputPasswordConfirm" value={props.value}
                              onChange={props.onChange} autoFocus={false}
                              class={props.isChecked ? "bg-secondary bg-opacity-10" : "warning-focus"}/>
            <NoFocusButton onClick={props.onClick} class="position-absolute z-index-6 pt-0 pe-0"
                           text={<img src={eye} width="42" height="45" alt=""/>}/>
        </div>
    </>);
}
