import type {MouseEventHandler} from "react";
import ColorButton from "./colorButton";
import {TODO_COLOR_NAMES} from "../../todoColors";

type ColorButtonGroupProps = {
    onClick: MouseEventHandler<HTMLButtonElement>;
};

export default function ColorButtonGroup(props: ColorButtonGroupProps) {
    return (
        <div className="btn-group w-100 my-2" role="group">
            {TODO_COLOR_NAMES.map((color) =>
                <ColorButton key={color} color={color} onClick={props.onClick}
                             class="mx-1 mx-sm-2 mx-md-3 mx-xxl-4 mb-1 mb-sm-2 px-2 px-sm-0"/>
            )}
        </div>
    );
}
