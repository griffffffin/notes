import PasswordAndTooltip from "./passwordAndTooltip";
import PasswordConfirmAndErrorLabel from "./passwordConfirmAndErrorLabel";
import {useTheme} from "../../../../../contexts/theme-context";

export default function PasswordGroup(props) {
    const {isChecked} = useTheme();

    return (
        <div className={isChecked ? "text-black-50 " + props.mb : props.mb}>
            <PasswordAndTooltip isLogin={props.isLogin} isVisible={props.isVisible}
                                value={props.password} handleChange={props.handlePasswordChange}
                                handleClick={props.handleClick}/>
            <PasswordConfirmAndErrorLabel isLogin={props.isLogin}
                                          value={props.passwordConfirm} handleChange={props.handlePasswordConfirmChange}
                                          handleClick={props.handleClick} isSignUpError={props.isSignUpError}
                                          isLoginError={props.isLoginError} isVisible={props.isVisible}/>
        </div>
    );
}
