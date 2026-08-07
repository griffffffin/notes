import PasswordConfirm, {type PasswordConfirmProps} from "./passwordConfirm";
import ErrorLabel from "../../errorLabel";
import {useTheme} from "../../../../../contexts/theme-context";

/* A megerősítő mező ÉS a hibafelirat együtt: a kettő ugyanattól a nézettől függ.
   Regisztrációnál a megerősítés + "a név foglalt" felirat, belépésnél CSAK a
   "hibás név vagy jelszó" felirat — a megerősítő mező ott nem is létezik.

   A propok nagy része változatlanul megy tovább a PasswordConfirm-nek, ezért a
   típusa ONNAN származik (indexelt hozzáférés): ha ott változik egy alak, itt
   magától követi, nem kell két helyen átvezetni. */
type PasswordConfirmAndErrorLabelProps = {
    isLogin: boolean;
    isVisible: PasswordConfirmProps["isVisible"];
    value: PasswordConfirmProps["value"];
    handleChange: PasswordConfirmProps["onChange"];
    handleClick: PasswordConfirmProps["onClick"];
    isSignUpError: boolean;
    isLoginError: boolean;
};

export default function PasswordConfirmAndErrorLabel(props: PasswordConfirmAndErrorLabelProps) {
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
