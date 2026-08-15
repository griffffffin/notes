import {Link} from "react-router-dom";
import ColorButton from "../Button/colorButton";
import type {TodoColor} from "../../todoColors";
import type {MouseEventHandler} from "react";
import {PATHS} from "../../paths";

type LinkColorButtonProps = {
    color: TodoColor;
    onClick: MouseEventHandler<HTMLButtonElement>;
};

export default function LinkColorButton(props: LinkColorButtonProps) {
    return (
        // A tabIndex SZÁM, nem szöveg — a "-1" idézőjelesen is működött (a React
        // ugyanazt az attribútumot írja ki), de csak a típusellenőrzés mutatta meg,
        // hogy a prop valójában számot vár. A -1 értelme: a link maga ne legyen
        // Tab-bal elérhető, mert a fókuszt a benne ülő gomb viszi.
        <Link to={PATHS.todoColor(props.color)} tabIndex={-1}>
            <ColorButton color={props.color} class="mx-2 float-end" onClick={props.onClick}/>
        </Link>
    );
}
