import {Link} from "react-router-dom";
import ColorButton from "../Button/colorButton";

export default function LinkColorButton(props) {
    return (
        <Link to="/color" state={{color: props.color}} tabIndex="-1">
            <ColorButton color={props.color} class="mx-2 float-end" onClick={props.onClick}/>
        </Link>
    );
}
