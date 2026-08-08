import RoundedPillInput from "../../../Input/roundedPillInput";
import PasswordGroup, {type PasswordGroupProps} from "./Password/passwordGroup";
import {useTheme} from "../../../../contexts/theme-context";

/* A teljes űrlap-belső: cím, felhasználónév, és alatta a jelszó-csoport. A
   jelszóhoz tartozó propokat változatlanul adja tovább, ezért azok típusa a
   PasswordGroup-ból származik — EGY kivétellel: az `isPasswordVisible` itt más
   néven fut (lentebb `isVisible`-ként megy tovább), mert ezen a szinten a "mi
   látszik" kérdés a jelszóra vonatkozik, nem a csoportra. */
type InputGroupProps = Omit<PasswordGroupProps, "isVisible"> & {
    isPasswordVisible: PasswordGroupProps["isVisible"];
    name: string;
    handleNameChange: PasswordGroupProps["handlePasswordChange"];
};

export default function InputGroup(props: InputGroupProps) {
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
                       errorMessage={props.errorMessage}/>
    </>);
}
