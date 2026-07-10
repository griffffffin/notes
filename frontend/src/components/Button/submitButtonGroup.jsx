import SubmitButton from "./submitButton";
import {Link} from "react-router-dom";

export default function SubmitButtonGroup(props) {
    return (
        <div className="d-grid gap-2">
            <SubmitButton isDisabled={props.isDisabled} isOutline={false} color={props.color} text="Tovább"/>
            <hr className="w-90 mx-auto"/>
            <Link to={props.isLogin ? "/signup" : "/"} tabIndex="-1">
                <SubmitButton onClick={props.onClick} isDisabled={false} isOutline={true} color={props.color}
                              text={props.isLogin ? "Fiók létrehozása" : "Bejelentkezés"}/>
            </Link>
        </div>
    );
}
