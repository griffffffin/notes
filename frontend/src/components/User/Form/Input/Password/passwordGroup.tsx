import PasswordAndTooltip, {type PasswordAndTooltipProps} from "./passwordAndTooltip";
import PasswordConfirmAndErrorLabel from "./passwordConfirmAndErrorLabel";
import {useTheme} from "../../../../../contexts/theme-context";

/* A két jelszó-mező közös burkolója. Saját állapota nincs: mindent felülről kap
   és lefelé ad — a beírt értékek EGY helyen (Entry) élnek, mert a mentés is ott
   történik, és a két mező egyezését is ott vizsgáljuk. */
export type PasswordGroupProps = {
    /* A csoport alatti térköz Bootstrap-osztálya. Azért prop és nem itt eldöntött
       állandó, mert hibaüzenetkor összébb húzódik — az Entry származtatja. */
    mb: string;
    isLogin: boolean;
    handleClick: PasswordAndTooltipProps["handleClick"];
    isVisible: PasswordAndTooltipProps["isVisible"];
    password: string;
    handlePasswordChange: PasswordAndTooltipProps["handleChange"];
    passwordConfirm: string;
    handlePasswordConfirmChange: PasswordAndTooltipProps["handleChange"];
    isSignUpError: boolean;
    isLoginError: boolean;
};

export default function PasswordGroup(props: PasswordGroupProps) {
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
