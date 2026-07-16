import ColorButton from "./colorButton";
import {TODO_COLORS} from "../../todoColors";

export default function ColorButtonGroup(props) {
    return (
        <div className="btn-group w-100 my-2" role="group">
            {Object.keys(TODO_COLORS).map((color) =>
                <ColorButton key={color} color={color} onClick={props.onClick}
                             class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            )}
        </div>
    );
}
