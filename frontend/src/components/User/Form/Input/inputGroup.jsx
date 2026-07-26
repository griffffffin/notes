import RoundedPillInput from "../../../Input/roundedPillInput";
import PasswordGroup from "./Password/passwordGroup";
import {useTheme} from "../../../../contexts/theme-context";

export default function InputGroup(props) {
    const {isChecked} = useTheme();

    return (<>
        <div className="mb-5 text-center">
            <h1><strong>{props.isLogin ? "Bejelentkezés" : "Fiók létrehozása"}</strong></h1>
        </div>

        <div className={isChecked ? "mb-3 text-black-50" : "mb-3"}>
            <label htmlFor="inputName" className="form-label ps-3">Felhasználónév</label>
            <RoundedPillInput id="inputName" value={props.name} onChange={props.handleNameChange} autoFocus={true}
                              class={isChecked ? "bg-secondary bg-opacity-10" : "theme-focus"}/>
        </div>

        <PasswordGroup mb={props.mb} isLogin={props.isLogin} handleClick={props.handleClick}
                       isVisible={props.isPasswordVisible}
                       password={props.password} handlePasswordChange={props.handlePasswordChange}
                       passwordConfirm={props.passwordConfirm}
                       handlePasswordConfirmChange={props.handlePasswordConfirmChange}
                       isSignUpError={props.isSignUpError} isLoginError={props.isLoginError}/>
    </>);
}
