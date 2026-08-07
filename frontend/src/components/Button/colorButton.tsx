import type {MouseEventHandler} from "react";
import type {TodoColor} from "../../todoColors";

/* A `class` prop neve NEM elírás és nem is a React `className`-je: a projekt
   saját konvenciója, hogy a hívó a Bootstrap-osztályokat adja át, a komponens
   pedig hozzáfűzi a sajátjait. Mivel a `class` foglalt szó, típusban idézőjelek
   nélkül is megáll, de destrukturálni csak átnevezéssel lehetne — ezért maradt a
   `props.` alak. */
type ColorButtonProps = {
    color: TodoColor;
    onClick: MouseEventHandler<HTMLButtonElement>;
    class: string;
};

export default function ColorButton(props: ColorButtonProps) {
    return (
        <button type="button" value={props.color} onClick={props.onClick}
                className={props.class + " rounded-circle btn btn-lg btn-" + props.color}>
            &nbsp;&nbsp;
        </button>
    );
}