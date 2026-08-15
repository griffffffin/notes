import SubmitButton from "./submitButton";
import {Link} from "react-router-dom";
import {useTheme} from "../../contexts/theme-context";
import {PATHS} from "../../paths";

type SubmitButtonGroupProps = {
    isDisabled: boolean;
    /* Melyik nézetben állunk: a belépőn (ekkor a másodlagos gomb a regisztrációra
       visz) vagy a regisztráción. Egyetlen zászló, mert a két nézet ugyanaz az
       űrlap, csak más szöveggel és céllal. */
    isLogin: boolean;
};

export default function SubmitButtonGroup(props: SubmitButtonGroupProps) {
    const {color} = useTheme();

    return (
        <div className="d-grid gap-2">
            <SubmitButton isDisabled={props.isDisabled} isOutline={false} color={color} text="Tovább"/>
            <hr className="w-90 mx-auto"/>
            {/* A tabIndex SZÁM, nem szöveg. Eddig `tabIndex="-1"` állt itt: a React
                mindkettőt ugyanarra a "-1" attribútumra fordítja, tehát a hiba néma
                volt — a típusellenőrzés hozta elő. A -1 értelme: a link maga ne
                legyen Tab-bal elérhető, mert a fókuszt a benne ülő gomb viszi. */}
            <Link to={props.isLogin ? PATHS.signup : PATHS.root} tabIndex={-1}>
                <SubmitButton isDisabled={false} isOutline={true} color={color}
                              text={props.isLogin ? "Fiók létrehozása" : "Bejelentkezés"}/>
            </Link>
        </div>
    );
}
