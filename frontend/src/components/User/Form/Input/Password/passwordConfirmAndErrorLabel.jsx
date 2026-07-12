import PasswordConfirm from "./passwordConfirm";
import ErrorLabel from "../../errorLabel";
import {useTheme} from "../../../../../contexts/theme";

export default function PasswordConfirmAndErrorLabel(props) {
    const {isChecked} = useTheme();

    return (!props.isLogin ?
            <div className={isChecked ? "mb-5 text-black-50" : "mb-5"}>
                <PasswordConfirm isVisible={props.isVisible} value={props.value}
                                 onChange={props.handleChange} onClick={props.handleClick}/>
                <ErrorLabel isError={props.isSignUpError} value="A felhasználónév már foglalt."/>
            </div>
            : <ErrorLabel isError={props.isLoginError} value="Hibás felhasználónév vagy jelszó."/>
    );
}
