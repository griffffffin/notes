import PasswordConfirm, {type PasswordConfirmProps} from "./passwordConfirm";
import ErrorLabel from "../../errorLabel";
import {useTheme} from "../../../../../contexts/theme-context";

/* A megerősítő mező ÉS a hibafelirat együtt: a kettő ugyanattól a nézettől függ.
   Regisztrációnál a megerősítés + a hibafelirat, belépésnél CSAK a felirat — a
   megerősítő mező ott nem is létezik.

   A felirat SZÖVEGÉT nem itt döntjük el (korábban két bedrótozott mondat állt
   itt, űrlaponként egy). A mondat ahhoz tartozik, ami elromlott, nem ahhoz,
   hogy hova rajzoljuk — ezért a szövegtábla az entryError.ts-ben él, ide pedig
   kész üzenet érkezik. Enélkül minden új hibaeset ezt a fájlt is módosítaná.

   A propok nagy része változatlanul megy tovább a PasswordConfirm-nek, ezért a
   típusa ONNAN származik (indexelt hozzáférés): ha ott változik egy alak, itt
   magától követi, nem kell két helyen átvezetni. */
type PasswordConfirmAndErrorLabelProps = {
    isLogin: boolean;
    isVisible: PasswordConfirmProps["isVisible"];
    value: PasswordConfirmProps["value"];
    handleChange: PasswordConfirmProps["onChange"];
    handleClick: PasswordConfirmProps["onClick"];
    /* Kész üzenet vagy semmi — l. errorLabel.tsx. */
    errorMessage: string | null;
};

export default function PasswordConfirmAndErrorLabel(props: PasswordConfirmAndErrorLabelProps) {
    const {isChecked} = useTheme();

    return (!props.isLogin ?
            <div className={isChecked ? "mb-5 text-black-50" : "mb-5"}>
                <PasswordConfirm isVisible={props.isVisible} value={props.value}
                                 onChange={props.handleChange} onClick={props.handleClick}/>
                <ErrorLabel message={props.errorMessage}/>
            </div>
            : <ErrorLabel message={props.errorMessage}/>
    );
}
