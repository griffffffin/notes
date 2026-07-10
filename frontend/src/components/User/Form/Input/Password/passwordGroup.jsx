import PasswordAndTooltip from "./passwordAndTooltip";
import PasswordConfirmAndErrorLabel from "./passwordConfirmAndErrorLabel";

export default function PasswordGroup(props) {
    return (
        <div className={props.isChecked ? "text-black-50 " + props.mb : props.mb}>
            <PasswordAndTooltip isLogin={props.isLogin} color={props.color} colorHex={props.colorHex}
                                backgroundColor={props.backgroundColor} isVisible={props.isVisible}
                                value={props.password} handleChange={props.handlePasswordChange}
                                isChecked={props.isChecked} handleClick={props.handleClick}/>
            <PasswordConfirmAndErrorLabel isLogin={props.isLogin} isChecked={props.isChecked}
                                          value={props.passwordConfirm} handleChange={props.handlePasswordConfirmChange}
                                          handleClick={props.handleClick} isSignUpError={props.isSignUpError}
                                          isLoginError={props.isLoginError} isVisible={props.isVisible}/>
        </div>
    );
}
