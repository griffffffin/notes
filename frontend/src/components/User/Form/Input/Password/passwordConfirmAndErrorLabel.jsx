import PasswordConfirm from "./passwordConfirm";
import ErrorLabel from "../../errorLabel";

export default function PasswordConfirmAndErrorLabel(props) {
    return (!props.isLogin ?
            <div className={props.isChecked ? "mb-5 text-black-50" : "mb-5"}>
                <PasswordConfirm isChecked={props.isChecked} isVisible={props.isVisible} value={props.value}
                                 onChange={props.handleChange} onClick={props.handleClick}/>
                <ErrorLabel isError={props.isSignUpError} value="A felhasználónév már foglalt."/>
            </div>
            : <ErrorLabel isError={props.isLoginError} value="Hibás felhasználónév vagy jelszó."/>
    );
}
